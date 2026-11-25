"""Triagem e agenda: o que atualizar em cada execução (com milhares de instrumentos).

Para cada instrumento guarda-se (em `cache/triagem.json`) o resultado da última verificação:
    "dividendos"      pagou nos últimos 24 meses → está no radar, atualiza-se todas as noites
    "sem_dividendos"  não pagou → volta a verificar-se ao fim de DIAS_REVER["sem_dividendos"]
    "sem_simbolo"     não foi encontrado no Yahoo → volta a tentar-se mais tarde
    "erro"            falhou por outro motivo → tenta-se de novo na próxima execução

Ordem de cada noite (até acabar o tempo disponível):
    1. os que estão no radar, primeiro os atualizados há mais tempo;
    2. os nunca verificados (os da lista manual primeiro);
    3. os que já chegou a altura de rever.
Assim, se o tempo acabar, ninguém fica esquecido: na noite seguinte continua-se onde parou.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

DIAS_REVER = {"sem_dividendos": 60, "sem_simbolo": 30, "erro": 0}


class Triagem:
    def __init__(self, pasta: Path):
        self.ficheiro = Path(pasta) / "triagem.json"
        self.dados: dict[str, dict] = {}
        if self.ficheiro.exists():
            try:
                self.dados = json.loads(self.ficheiro.read_text(encoding="utf-8")).get("instrumentos", {})
            except (json.JSONDecodeError, AttributeError):
                self.dados = {}

    def estado(self, ticker: str) -> str | None:
        return (self.dados.get(ticker) or {}).get("estado")

    def simbolo(self, ticker: str) -> str | None:
        """Símbolo Yahoo que funcionou da última vez (descoberto por pesquisa ou alternativa)."""
        return (self.dados.get(ticker) or {}).get("ticker_yahoo")

    def marcar(self, ticker: str, estado: str, hoje: dt.date, ticker_yahoo: str | None = None,
               erro: str | None = None) -> None:
        anterior = self.dados.get(ticker) or {}
        novo = {"estado": estado, "verificado_em": hoje.isoformat()}
        if ticker_yahoo or anterior.get("ticker_yahoo"):
            novo["ticker_yahoo"] = ticker_yahoo or anterior.get("ticker_yahoo")
        if estado == "erro":
            novo["estado_anterior"] = anterior.get("estado_anterior") or anterior.get("estado")
            novo["erro"] = (erro or "")[:200]
            novo["erros_seguidos"] = int(anterior.get("erros_seguidos", 0)) + 1
        self.dados[ticker] = novo

    def no_radar(self, ticker: str) -> bool:
        d = self.dados.get(ticker) or {}
        return d.get("estado") == "dividendos" or (d.get("estado") == "erro" and d.get("estado_anterior") == "dividendos")

    def ordem(self, itens: list[dict], hoje: dt.date, atualizado_em: dict[str, str] | None = None) -> list[dict]:
        """Instrumentos a processar nesta execução, pela ordem de prioridade."""
        atualizado_em = atualizado_em or {}
        radar, novos, rever = [], [], []
        for i in itens:
            t = i["ticker_xtb"]
            d = self.dados.get(t)
            if d is None:
                novos.append(i)
            elif self.no_radar(t):
                radar.append(i)
            else:
                est = d.get("estado_anterior") if d.get("estado") == "erro" else d.get("estado")
                dias = DIAS_REVER.get(d.get("estado"), 0) if d.get("estado") != "erro" else 0
                if est is None or (hoje - dt.date.fromisoformat(d["verificado_em"])).days >= dias:
                    rever.append(i)
        radar.sort(key=lambda i: atualizado_em.get(i["ticker_xtb"], ""))
        novos.sort(key=lambda i: 0 if i.get("origem", "manual") == "manual" else 1)
        rever.sort(key=lambda i: (self.dados[i["ticker_xtb"]].get("verificado_em", ""), i["ticker_xtb"]))
        return radar + novos + rever

    def contagem(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for d in self.dados.values():
            out[d.get("estado", "?")] = out.get(d.get("estado", "?"), 0) + 1
        return out

    def recuperar(self, universo: dict) -> int:
        """Reconstrói a triagem a partir do data/universo.json publicado (se a cache do GitHub
        se perdeu). Os estados ficam com a data desse ficheiro, por isso a agenda de revisões
        continua (ex.: quem não paga dividendos só volta a ser visto ao fim de 60 dias)."""
        try:
            quando = dt.date.fromisoformat(str(universo.get("gerado_em", ""))[:10])
        except ValueError:
            return 0
        estados = {"radar": "dividendos", "dividendos": "dividendos",
                   "sem_dividendos": "sem_dividendos", "sem_simbolo": "sem_simbolo"}
        n = 0
        for t, i in (universo.get("instrumentos") or {}).items():
            estado = estados.get(i.get("e"))
            if estado and t not in self.dados:
                self.dados[t] = {"estado": estado, "verificado_em": quando.isoformat(), "recuperado": True}
                n += 1
        return n

    def guardar(self) -> None:
        self.ficheiro.parent.mkdir(parents=True, exist_ok=True)
        self.ficheiro.write_text(json.dumps({"versao": 1, "instrumentos": self.dados}, ensure_ascii=False),
                                 encoding="utf-8")
