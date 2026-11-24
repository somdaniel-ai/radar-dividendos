"""Prepara o modelo de tradução de código aberto (OPUS-MT, inglês → português).

Descarrega o modelo `Helsinki-NLP/opus-mt-tc-big-en-pt` (licença CC-BY-4.0, da Universidade
de Helsínquia) e converte-o para o formato CTranslate2 "int8", que é ~4× mais pequeno e
mais rápido a correr num processador normal (sem placa gráfica).

Só é preciso correr uma vez: no GitHub o resultado fica guardado na cache do Actions.
Precisa (só aqui) de: torch, transformers, sentencepiece, ctranslate2.

    python -m ferramentas.preparar_modelo [pasta_destino]
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

MODELO_HF = "Helsinki-NLP/opus-mt-tc-big-en-pt"
PASTA_PADRAO = Path(__file__).resolve().parents[1] / "modelos" / "opus-mt-en-pt"


def preparar(destino: Path = PASTA_PADRAO) -> Path:
    destino = Path(destino)
    if (destino / "model.bin").exists():
        print(f"Modelo já preparado em {destino}")
        return destino
    from ctranslate2.converters import TransformersConverter

    temp = destino.with_name(destino.name + ".tmp")
    shutil.rmtree(temp, ignore_errors=True)
    TransformersConverter(MODELO_HF, copy_files=["source.spm", "target.spm"]).convert(
        str(temp), quantization="int8", force=True)
    shutil.rmtree(destino, ignore_errors=True)
    temp.rename(destino)
    print(f"Modelo preparado em {destino}")
    return destino


if __name__ == "__main__":
    preparar(Path(sys.argv[1]) if len(sys.argv) > 1 else PASTA_PADRAO)
