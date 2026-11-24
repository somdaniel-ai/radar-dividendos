"""Cópia local dos dados (cache) com atualização incremental.

- Preços/dividendos: na 1.ª vez descarrega tudo; depois só os últimos dias.
  Se aparecer um dividendo ou desdobramento novo, volta a descarregar tudo
  (porque o preço "ajustado" de todo o histórico muda).
- Perfil (setor, país, payout…): renovado ao fim de `horas_perfil`.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import re
from pathlib import Path

import pandas as pd

from .fornecedores import Fornecedor

log = logging.getLogger(__name__)


def _nome(ticker: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", ticker)


class Cache:
    def __init__(self, pasta: Path, fornecedor: Fornecedor, horas_perfil: float = 20,
                 dias_recarga_total: int = 30, dias_sobreposicao: int = 14):
        self.pasta = Path(pasta)
        self.pasta.mkdir(parents=True, exist_ok=True)
        self.f = fornecedor
        self.horas_perfil = horas_perfil
        self.dias_recarga_total = dias_recarga_total
        self.dias_sobreposicao = dias_sobreposicao

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
        fp, fd = d / "precos.csv", d / "dividendos.csv"
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

        precos.to_csv(fp, index_label="data")
        div.rename("valor").to_csv(fd, index_label="data")
        meta["ultima_atualizacao"] = hoje.isoformat()
        self._guardar_meta(ticker, meta)
        return precos, div

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
            if (agora - quando).total_seconds() < self.horas_perfil * 3600:
                return _datas(guardado)
        perfil = self.f.obter_perfil(ticker)
        f.write_text(json.dumps({**perfil, "_obtido_em": agora.isoformat()}, default=str), encoding="utf-8")
        return perfil


def _datas(perfil: dict) -> dict:
    for k in ("proxima_ex", "data_pagamento"):
        if perfil.get(k):
            perfil[k] = dt.date.fromisoformat(perfil[k])
    return perfil
