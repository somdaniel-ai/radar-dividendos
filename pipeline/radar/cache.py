"""Cópia local dos dados (cache) com atualização incremental.

- Preços/dividendos: na 1.ª vez descarrega tudo; depois só os últimos dias.
  Se aparecer um dividendo ou desdobramento novo, volta a descarregar tudo
  (porque o preço "ajustado" de todo o histórico muda).
- Perfil (setor, país, payout…): renovado ao fim de `horas_perfil`.
- Para caber milhares de instrumentos na cache do GitHub (máx. 10 GB), os preços guardam-se
  comprimidos (precos.csv.gz), só dos últimos `anos_precos` anos e com 6 algarismos
  significativos. Os dividendos guardam-se sempre todos (são poucos e servem para a
  consistência de muitos anos).
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import re
import shutil
from pathlib import Path

import pandas as pd

from .fornecedores import Fornecedor

log = logging.getLogger(__name__)

# aumentar quando o fornecedor passa a devolver campos novos no perfil (força renovação)
VERSAO_PERFIL = 2


def _nome(ticker: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", ticker)


class Cache:
    def __init__(self, pasta: Path, fornecedor: Fornecedor, horas_perfil: float = 20,
                 dias_recarga_total: int = 30, dias_sobreposicao: int = 14, anos_precos: int = 12):
        self.pasta = Path(pasta)
        self.pasta.mkdir(parents=True, exist_ok=True)
        self.f = fornecedor
        self.horas_perfil = horas_perfil
        self.dias_recarga_total = dias_recarga_total
        self.dias_sobreposicao = dias_sobreposicao
        self.anos_precos = anos_precos

    def apagar(self, ticker: str) -> None:
        """Apaga a cópia local de um instrumento (ex.: deixou de pagar dividendos)."""
        shutil.rmtree(self.pasta / _nome(ticker), ignore_errors=True)

    def _dir(self, ticker):
        d = self.pasta / _nome(ticker)
        d.mkdir(exist_ok=True)
        return d

    def _meta(self, ticker) -> dict:
        f = self._dir(ticker) / "meta.json"
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}

    def _guardar_meta(self, ticker, meta):
        (self._dir(ticker) / "meta.json").write_text(json.dumps(meta, default=str), encoding="utf-8")

    def historico(self, ticker: str, hoje: dt.date) -> tuple[pd.DataFrame, pd.Series]:
        d = self._dir(ticker)
        fp, fd = d / "precos.csv.gz", d / "dividendos.csv"
        if not fp.exists() and (d / "precos.csv").exists():  # formato antigo (sem compressão)
            fp_antigo = d / "precos.csv"
            self._compactar(pd.read_csv(fp_antigo, index_col="data", parse_dates=["data"]), hoje).to_csv(
                fp, index_label="data", compression="gzip")
            fp_antigo.unlink()
        meta = self._meta(ticker)
        ultima_total = meta.get("ultima_recarga_total")
        precisa_total = (not fp.exists() or not ultima_total
                         or (hoje - dt.date.fromisoformat(ultima_total)).days >= self.dias_recarga_total)
        if meta.get("ultima_atualizacao") == hoje.isoformat() and fp.exists():
            return self._ler(fp, fd)

        if not precisa_total:
            antigo_p, antigo_d = self._ler(fp, fd)
            desde = antigo_p.index.max().date() - dt.timedelta(days=self.dias_sobreposicao)
            novo_p, novo_d = self.f.obter_historico(ticker, desde)
            div_novos = novo_d[novo_d.index > (antigo_d.index.max() if len(antigo_d) else pd.Timestamp.min)]
            if len(div_novos) or novo_p.attrs.get("tem_split"):
                log.info("%s: dividendo/desdobramento novo → recarga total", ticker)
                precisa_total = True
            else:
                precos = pd.concat([antigo_p[antigo_p.index < novo_p.index.min()], novo_p])
                div = antigo_d
        if precisa_total:
            precos, div = self.f.obter_historico(ticker, None)
            meta["ultima_recarga_total"] = hoje.isoformat()

        precos = self._compactar(precos, hoje)
        precos.to_csv(fp, index_label="data", compression="gzip")
        div.rename("valor").to_csv(fd, index_label="data")
        meta["ultima_atualizacao"] = hoje.isoformat()
        self._guardar_meta(ticker, meta)
        return precos, div

    def _compactar(self, precos: pd.DataFrame, hoje: dt.date) -> pd.DataFrame:
        inicio = pd.Timestamp(hoje) - pd.DateOffset(years=self.anos_precos)
        antigo = precos[precos.index < inicio]
        if len(antigo):
            # antes disso: só os dias de cada mês com o máximo e o mínimo (normal e ajustado),
            # para os máximos/mínimos "de sempre" continuarem exatamente iguais
            fator = antigo["adjclose"] / antigo["close"]
            aux = pd.DataFrame({"h": antigo["high"], "l": antigo["low"],
                                "ha": antigo["high"] * fator, "la": antigo["low"] * fator}, index=antigo.index)
            g = aux.groupby(aux.index.to_period("M"))
            dias = set()
            for col, fn in (("h", "idxmax"), ("l", "idxmin"), ("ha", "idxmax"), ("la", "idxmin")):
                dias |= set(getattr(g[col], fn)().dropna())
            out = pd.concat([antigo.loc[sorted(dias)], precos[precos.index >= inicio]])
        else:
            out = precos.copy()
        for c in out.columns:
            out[c] = out[c].map(lambda v: float(f"{v:.6g}") if pd.notna(v) else v)
        out.attrs = dict(precos.attrs)
        return out

    @staticmethod
    def _ler(fp: Path, fd: Path):
        p = pd.read_csv(fp, index_col="data", parse_dates=["data"])
        if fd.exists() and fd.stat().st_size > 10:
            dv = pd.read_csv(fd, index_col="data", parse_dates=["data"])["valor"]
        else:
            dv = pd.Series(dtype=float, index=pd.DatetimeIndex([], name="data"))
        return p, dv

    def perfil(self, ticker: str, agora: dt.datetime) -> dict:
        f = self._dir(ticker) / "perfil.json"
        if f.exists():
            guardado = json.loads(f.read_text(encoding="utf-8"))
            quando = dt.datetime.fromisoformat(guardado["_obtido_em"])
            if (guardado.get("_versao") == VERSAO_PERFIL
                    and (agora - quando).total_seconds() < self.horas_perfil * 3600):
                return _datas(guardado)
        perfil = self.f.obter_perfil(ticker)
        f.write_text(json.dumps({**perfil, "_obtido_em": agora.isoformat(), "_versao": VERSAO_PERFIL},
                                default=str), encoding="utf-8")
        return perfil


def _datas(perfil: dict) -> dict:
    for k in ("proxima_ex", "data_pagamento"):
        if perfil.get(k):
            perfil[k] = dt.date.fromisoformat(perfil[k])
    return perfil
