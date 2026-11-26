"""Decisões sobre possíveis extraordinários guardadas na conta (Supabase).

O utilizador confirma ou rejeita na app; aqui o motor lê essas decisões todas as noites.

Acesso mínimo: o motor NÃO usa a chave secreta do Supabase. Usa a chave publicável (pública)
e a "chave do motor" (segredo `SUPABASE_CHAVE_MOTOR` no GitHub), que só serve para chamar a
função `decisoes_motor`, que devolve apenas ticker, data, decisão e parte extra.
"""
from __future__ import annotations

import json
import logging
import os

import requests

log = logging.getLogger(__name__)

# chave PUBLICÁVEL (pública, a mesma da app). Nunca pôr aqui a chave secreta.
from .supabase_config import SUPABASE_CHAVE_PUBLICA, SUPABASE_URL  # noqa: E402


def ler_da_conta(chave_motor: str | None = None, sessao=requests) -> list[dict] | None:
    """Lista de decisões [{ticker, data, decisao, valor_extra}] ou None (sem chave ou erro)."""
    chave_motor = (chave_motor if chave_motor is not None else os.environ.get("SUPABASE_CHAVE_MOTOR", "")).strip()
    if not chave_motor:
        log.info("Sem SUPABASE_CHAVE_MOTOR: decisões só dos ficheiros CSV")
        return None
    try:
        r = sessao.post(f"{SUPABASE_URL}/rest/v1/rpc/decisoes_motor", json={"chave": chave_motor}, timeout=30,
                        headers={"apikey": SUPABASE_CHAVE_PUBLICA, "Content-Type": "application/json"})
        if r.status_code != 200:
            # nunca escrever a chave no registo
            log.warning("Não foi possível ler as decisões da conta (HTTP %s)", r.status_code)
            return None
        linhas = r.json()
        return [{"ticker": str(x["ticker"]).upper(), "data": str(x["data"])[:10],
                 "decisao": x["decisao"], "valor_extra": float(x["valor_extra"] or 0)} for x in linhas]
    except Exception as e:  # noqa: BLE001 — sem decisões da conta o motor continua com os CSV
        log.warning("Não foi possível ler as decisões da conta (%s)", type(e).__name__)
        return None


def juntar(extras: dict[str, dict[str, float]], rejeitados: dict[str, list[str]],
           conta: list[dict] | None) -> tuple[dict[str, dict[str, float]], dict[str, list[str]]]:
    """Junta as decisões da conta às dos CSV. A conta ganha quando a data é a mesma."""
    ext = {t: dict(v) for t, v in extras.items()}
    rej = {t: list(v) for t, v in rejeitados.items()}
    for d in conta or []:
        t, data = d["ticker"], d["data"]
        if d["decisao"] == "confirmar" and d["valor_extra"] > 0:
            ext.setdefault(t, {})[data] = d["valor_extra"]
            if data in rej.get(t, []):
                rej[t].remove(data)
        elif d["decisao"] == "rejeitar":
            ext.get(t, {}).pop(data, None)
            if data not in rej.setdefault(t, []):
                rej[t].append(data)
    return ext, rej


def assinaturas(conta: list[dict] | None) -> dict[str, str]:
    """{ticker: texto} para saber de uma noite para a outra que decisões mudaram."""
    por: dict[str, list] = {}
    for d in conta or []:
        por.setdefault(d["ticker"], []).append([d["data"], d["decisao"], round(d["valor_extra"], 6)])
    return {t: json.dumps(sorted(v)) for t, v in por.items()}


def mudaram(antigas: dict[str, str], novas: dict[str, str]) -> set[str]:
    return {t for t in set(antigas) | set(novas) if antigas.get(t) != novas.get(t)}
