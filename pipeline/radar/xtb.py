"""Lista oficial de instrumentos da XTB (ações e ETF reais — "OMI").

A XTB publica a lista num PDF público ("Tabela de especificações – Instrumentos do mercado
organizado"), ligado na página https://www.xtb.com/pt/especificacao-de-instrumentos/documentos.
O robots.txt do site não proíbe este ficheiro. Para não sobrecarregar o site, o PDF é
descarregado no máximo uma vez por semana; se falhar, usa-se a última cópia guardada.

Cada linha do PDF tem: símbolo XTB (ex.: KO.US), nome, ISIN, moeda, tipo (ETF/ETN/ETC ou
nada = ação) e, nos ETF, normalmente "(Dist…" (distribui) ou "(Acc…" (acumula).
"""
from __future__ import annotations

import csv
import datetime as dt
import logging
import re
from pathlib import Path

import requests

log = logging.getLogger(__name__)

URL_LISTA = "https://www.xtb.com/pt/specification_table_omi-pt.pdf"
DIAS_RENOVAR = 7
COLUNAS = ["ticker_xtb", "nome", "isin", "moeda", "tipo", "distribuicao", "so_fecho"]

_LINHA = re.compile(
    r"^(?P<s>[A-Z0-9][A-Z0-9.\-_]*\.[A-Z]{2,3})(?P<f>\*{1,2})?\s+(?:MODO FECHO APENAS\s*/\s*)?"
    r"(?P<n>.+?)\s+(?P<isin>[A-Z]{2}[A-Z0-9]{9}\d)\s+(?P<m>[A-Z]{3})\s+(?:(?P<t>ETF|ETN|ETC)\s+)?\d")
_DIST = re.compile(r"\bdist(ributing)?\b|\(D\)|\b(USD|EUR|GBP|CHF)\s+D$|\b\d?D$", re.IGNORECASE)
_ACC = re.compile(r"\bacc(umulating)?\b|\(C\)|\bCap\b|\b(USD|EUR|GBP|CHF)\s+[AC]$|\b\dC$|\bT?C\s+C$", re.IGNORECASE)


def tipo_distribuicao(nome: str) -> str:
    """'Dist', 'Acc' ou '' (desconhecido) a partir do nome do ETF."""
    if _DIST.search(nome):
        return "Dist"
    if _ACC.search(nome):
        return "Acc"
    return ""


def ler_linhas(linhas) -> list[dict]:
    """Interpreta as linhas de texto do PDF. Um símbolo repetido fica só a 1.ª vez."""
    out: dict[str, dict] = {}
    for ln in linhas:
        m = _LINHA.match(ln.strip())
        if not m:
            continue
        s = m["s"]
        if s in out:
            continue
        tipo = m["t"] or "ACAO"
        out[s] = {"ticker_xtb": s, "nome": m["n"].strip(), "isin": m["isin"], "moeda": m["m"], "tipo": tipo,
                  "distribuicao": tipo_distribuicao(m["n"]) if tipo == "ETF" else "",
                  "so_fecho": "sim" if m["f"] else ""}
    return list(out.values())


def ler_pdf(caminho: Path) -> list[dict]:
    from pypdf import PdfReader
    linhas = []
    for pagina in PdfReader(str(caminho)).pages:
        linhas += (pagina.extract_text() or "").splitlines()
    return ler_linhas(linhas)


def obter_lista(pasta: Path, hoje: dt.date, url: str = URL_LISTA, descarregar=None) -> list[dict]:
    """Devolve a lista de instrumentos XTB (renovada no máximo 1×/semana).

    Guarda em `pasta/`: o PDF, a lista já lida (instrumentos.csv) e a data da última descarga.
    Se não conseguir descarregar, usa a última lista guardada (ou [] se nunca houve)."""
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    fcsv, fdata = pasta / "instrumentos.csv", pasta / "descarregado_em.txt"
    ultima = None
    if fdata.exists():
        try:
            ultima = dt.date.fromisoformat(fdata.read_text().strip())
        except ValueError:
            ultima = None
    if fcsv.exists() and ultima and (hoje - ultima).days < DIAS_RENOVAR:
        return _ler_csv(fcsv)
    try:
        conteudo = (descarregar or _descarregar)(url)
        fpdf = pasta / "lista_xtb.pdf"
        fpdf.write_bytes(conteudo)
        lista = ler_pdf(fpdf)
        if len(lista) < 1000:  # PDF mudou de formato? não estragar a lista que já temos
            raise ValueError(f"só {len(lista)} instrumentos lidos — formato do PDF mudou?")
        with open(fcsv, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=COLUNAS)
            w.writeheader()
            w.writerows(lista)
        fdata.write_text(hoje.isoformat())
        log.info("Lista XTB: %s instrumentos (descarregada agora)", len(lista))
        return lista
    except Exception as e:  # noqa: BLE001
        log.warning("Lista XTB não atualizada (%s): uso a última cópia guardada", e)
        return _ler_csv(fcsv) if fcsv.exists() else []


def _descarregar(url: str) -> bytes:
    r = requests.get(url, timeout=120, headers={"User-Agent": "Mozilla/5.0 (radar-dividendos; uso pessoal)"})
    r.raise_for_status()
    if not r.content.startswith(b"%PDF"):
        raise ValueError("a resposta não é um PDF")
    return r.content


def _ler_csv(caminho: Path) -> list[dict]:
    with open(caminho, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))
