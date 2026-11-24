"""Serviços de tradução das descrições.

Configuração por variáveis de ambiente (no GitHub vêm dos "segredos", nunca do código):
    RADAR_TRADUTOR              "azure" (ou "nenhum")
    AZURE_TRANSLATOR_KEY        chave do recurso Azure Translator (plano F0 - Free)
    AZURE_TRANSLATOR_REGION     região do recurso (ex.: westeurope); vazio se o recurso for "Global"
    RADAR_TRADUCAO_LIMITE_MES   opcional; limite mensal de caracteres (máx. 1 900 000)

Sem chave, as descrições ficam em inglês com a nota "tradução indisponível".
"""
from __future__ import annotations

import logging
import os
import time

import requests

from .traducoes import QuotaEsgotada, Tradutor

log = logging.getLogger(__name__)

ENDPOINT_AZURE = "https://api.cognitive.microsofttranslator.com/translate"


class Azure(Tradutor):
    """Microsoft Azure AI Translator (API v3), inglês → português de Portugal ("pt-pt")."""

    nome = "azure"

    def __init__(self, chave: str, regiao: str | None = None, pausa: float = 0.2, tentativas: int = 3):
        self.chave = chave
        self.regiao = (regiao or "").strip() or None
        self.pausa = pausa
        self.tentativas = tentativas
        self.disponivel = bool(chave)

    def traduzir(self, texto: str) -> str:
        cab = {"Ocp-Apim-Subscription-Key": self.chave, "Content-Type": "application/json"}
        if self.regiao:
            cab["Ocp-Apim-Subscription-Region"] = self.regiao
        params = {"api-version": "3.0", "from": "en", "to": "pt-pt", "textType": "plain"}
        erro = None
        for i in range(self.tentativas):
            time.sleep(self.pausa)
            r = requests.post(ENDPOINT_AZURE, params=params, headers=cab, json=[{"Text": texto}], timeout=30)
            if r.status_code == 200:
                return r.json()[0]["translations"][0]["text"]
            corpo = r.text[:300]
            # 403000/403001 = sem quota (plano gratuito esgotado) → não insistir
            if r.status_code == 403 or "quota" in corpo.lower():
                raise QuotaEsgotada(f"{r.status_code}: {corpo}")
            if r.status_code in (401,):
                raise RuntimeError(f"Chave ou região do Azure inválida ({r.status_code}): {corpo}")
            erro = f"{r.status_code}: {corpo}"
            if r.status_code == 429 or r.status_code >= 500:  # demasiados pedidos / erro do servidor
                time.sleep(2 * (2 ** i))
                continue
            break
        raise RuntimeError(f"Tradução falhou: {erro}")


def criar_tradutor() -> Tradutor | None:
    nome = (os.environ.get("RADAR_TRADUTOR") or "").strip().lower()
    if not nome or nome == "nenhum":
        return None
    if nome == "azure":
        chave = (os.environ.get("AZURE_TRANSLATOR_KEY") or "").strip()
        if not chave:
            log.warning("RADAR_TRADUTOR=azure mas falta AZURE_TRANSLATOR_KEY: descrições ficam em inglês")
            return None
        return Azure(chave, os.environ.get("AZURE_TRANSLATOR_REGION"))
    raise ValueError(f"Serviço de tradução desconhecido: {nome}")


def limite_mensal() -> int:
    from .traducoes import LIMITE_MENSAL_MAXIMO, LIMITE_MENSAL_PADRAO
    try:
        v = int(os.environ.get("RADAR_TRADUCAO_LIMITE_MES") or LIMITE_MENSAL_PADRAO)
    except ValueError:
        v = LIMITE_MENSAL_PADRAO
    return min(v, LIMITE_MENSAL_MAXIMO)
