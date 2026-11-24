import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _sem_rede_nem_tradutor(monkeypatch):
    """Os testes nunca vão buscar traduções ao site nem usam um tradutor real."""
    from radar import gerar
    monkeypatch.setattr(gerar, "URL_PUBLICA", "")
    monkeypatch.delenv("RADAR_TRADUTOR", raising=False)
    monkeypatch.delenv("AZURE_TRANSLATOR_KEY", raising=False)
    monkeypatch.delenv("RADAR_LISTA_XTB", raising=False)  # nunca descarrega a lista da XTB
    monkeypatch.delenv("RADAR_MINUTOS_DADOS", raising=False)
