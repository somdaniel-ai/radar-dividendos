"""Serviços de tradução das descrições (escolhidos pela variável de ambiente RADAR_TRADUTOR).

A chave do serviço fica SÓ nos segredos do GitHub (ou numa variável de ambiente local),
nunca no código. Sem serviço configurado, as descrições ficam em inglês com a nota
"tradução indisponível" e são traduzidas assim que houver serviço.

O serviço concreto é acrescentado depois de o utilizador escolher (ver README).
"""
from __future__ import annotations

import os

from .traducoes import Tradutor


def criar_tradutor() -> Tradutor | None:
    nome = (os.environ.get("RADAR_TRADUTOR") or "").strip().lower()
    if not nome or nome == "nenhum":
        return None
    raise ValueError(f"Serviço de tradução desconhecido: {nome}")
