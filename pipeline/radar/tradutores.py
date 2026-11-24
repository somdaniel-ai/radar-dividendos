"""Serviços de tradução das descrições.

Configuração por variáveis de ambiente:
    RADAR_TRADUTOR              "opus" (modelo aberto, sem conta — o que está ligado),
                                "azure" (desligado; precisa de conta e chave) ou "nenhum"
    RADAR_MODELO_OPUS           opcional; pasta do modelo OPUS-MT já preparado
    RADAR_TRADUCAO_MINUTOS      opcional; tempo máximo a traduzir por execução (padrão 15)
Só para o Azure (as chaves vêm dos "segredos" do GitHub, nunca do código):
    AZURE_TRANSLATOR_KEY        chave do recurso Azure Translator (plano F0 - Free)
    AZURE_TRANSLATOR_REGION     região do recurso (ex.: westeurope); vazio se o recurso for "Global"
    RADAR_TRADUCAO_LIMITE_MES   opcional; limite mensal de caracteres (máx. 1 900 000)

Sem chave, as descrições ficam em inglês com a nota "tradução indisponível".
"""
from __future__ import annotations

import logging
import os
import re
import time
from pathlib import Path

import requests

from .traducoes import QuotaEsgotada, Tradutor

log = logging.getLogger(__name__)

ENDPOINT_AZURE = "https://api.cognitive.microsofttranslator.com/translate"


class Azure(Tradutor):
    """Microsoft Azure AI Translator (API v3), inglês → português de Portugal ("pt-pt")."""

    nome = "azure"
    conta_caracteres = True  # plano F0: 2 milhões de caracteres por mês

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


PASTA_MODELO_OPUS = Path(__file__).resolve().parents[1] / "modelos" / "opus-mt-en-pt"
_FIM_FRASE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])")


class OpusMT(Tradutor):
    """Modelo de código aberto OPUS-MT (Helsinki-NLP/opus-mt-tc-big-en-pt), a correr no
    próprio computador/GitHub Actions — sem contas, chaves nem custos.

    Usa a variante europeia (marca ">>por<<"; a do Brasil seria ">>pob<<") e depois a
    tabela de correções de `ptpt.py`. O modelo é preparado por `ferramentas/preparar_modelo.py`.
    """

    nome = "opus-mt"

    def __init__(self, pasta: Path = PASTA_MODELO_OPUS, feixe: int = 2, lote: int = 32):
        self.pasta = Path(pasta)
        self.feixe = feixe
        self.lote = lote
        self.disponivel = (self.pasta / "model.bin").exists()
        self._modelo = None

    def _carregar(self):
        if self._modelo is None:
            import ctranslate2
            import sentencepiece as spm
            self._modelo = (
                ctranslate2.Translator(str(self.pasta), device="cpu", compute_type="int8",
                                       intra_threads=os.cpu_count() or 2),
                spm.SentencePieceProcessor(model_file=str(self.pasta / "source.spm")),
                spm.SentencePieceProcessor(model_file=str(self.pasta / "target.spm")),
            )
        return self._modelo

    @staticmethod
    def frases(texto: str) -> list[str]:
        return [f for f in (p.strip() for p in _FIM_FRASE.split(texto.strip())) if f]

    def traduzir(self, texto: str) -> str:
        from .ptpt import para_ptpt
        modelo, sp_origem, sp_destino = self._carregar()
        frases = self.frases(texto)
        tokens = [[">>por<<"] + sp_origem.encode(f, out_type=str)[:400] + ["</s>"] for f in frases]
        saida: list[str] = []
        for i in range(0, len(tokens), self.lote):
            res = modelo.translate_batch(tokens[i:i + self.lote], beam_size=self.feixe,
                                         max_decoding_length=512, max_batch_size=self.lote)
            saida += [sp_destino.decode(r.hypotheses[0]) for r in res]
        return para_ptpt(" ".join(s.strip() for s in saida))


def criar_tradutor() -> Tradutor | None:
    nome = (os.environ.get("RADAR_TRADUTOR") or "").strip().lower()
    if not nome or nome == "nenhum":
        return None
    if nome in ("opus", "opus-mt"):
        t = OpusMT(Path(os.environ["RADAR_MODELO_OPUS"]) if os.environ.get("RADAR_MODELO_OPUS") else PASTA_MODELO_OPUS)
        if not t.disponivel:
            log.warning("Modelo OPUS-MT não encontrado em %s: descrições ficam em inglês", t.pasta)
            return None
        return t
    if nome == "azure":
        chave = (os.environ.get("AZURE_TRANSLATOR_KEY") or "").strip()
        if not chave:
            log.warning("RADAR_TRADUTOR=azure mas falta AZURE_TRANSLATOR_KEY: descrições ficam em inglês")
            return None
        return Azure(chave, os.environ.get("AZURE_TRANSLATOR_REGION"))
    raise ValueError(f"Serviço de tradução desconhecido: {nome}")


def minutos_traducao() -> float:
    from .traducoes import MINUTOS_EXECUCAO_PADRAO
    try:
        return float(os.environ.get("RADAR_TRADUCAO_MINUTOS") or MINUTOS_EXECUCAO_PADRAO)
    except ValueError:
        return MINUTOS_EXECUCAO_PADRAO


def limite_mensal() -> int:
    from .traducoes import LIMITE_MENSAL_MAXIMO, LIMITE_MENSAL_PADRAO
    try:
        v = int(os.environ.get("RADAR_TRADUCAO_LIMITE_MES") or LIMITE_MENSAL_PADRAO)
    except ValueError:
        v = LIMITE_MENSAL_PADRAO
    return min(v, LIMITE_MENSAL_MAXIMO)
