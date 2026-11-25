"""Recupera os dados da última versão publicada da app (GitHub Pages) para a pasta data/.

Usado pelo GitHub Actions só quando a cópia local (cache do Actions) se perdeu: assim o radar,
as páginas das ações, as traduções e o estado da triagem continuam, em vez de começar do zero.
Os preços históricos não estão no site: voltam a ser descarregados nas noites seguintes.

    python -m ferramentas.recuperar_publicado https://<utilizador>.github.io/radar-dividendos/
"""
from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

import requests

RAIZ = Path(__file__).resolve().parents[2]
FICHEIROS = ["meta.json", "radar.json", "universo.json", "traducoes.json", "cambios.json",
             "extraordinarios_suspeitos.json"]


def recuperar(base: str, saida: Path, sessao=None) -> dict:
    s = sessao or requests.Session()
    base = base.rstrip("/") + "/data/"
    saida.mkdir(parents=True, exist_ok=True)
    obtidos = []
    for nome in FICHEIROS:
        r = s.get(base + nome, timeout=60)
        if r.ok:
            (saida / nome).write_bytes(r.content)
            obtidos.append(nome)
    if "radar.json" not in obtidos:
        return {"ficheiros": obtidos, "acoes": 0}
    tickers = [a["ticker"] for a in json.loads((saida / "radar.json").read_text(encoding="utf-8"))["acoes"]]
    (saida / "acoes").mkdir(exist_ok=True)

    def uma(t: str) -> bool:
        r = s.get(base + "acoes/" + quote(t) + ".json", timeout=60)
        if r.ok:
            (saida / "acoes" / f"{t}.json").write_bytes(r.content)
        return r.ok

    with ThreadPoolExecutor(8) as ex:
        ok = sum(ex.map(uma, tickers))
    return {"ficheiros": obtidos, "acoes": ok, "acoes_no_radar": len(tickers)}


if __name__ == "__main__":
    res = recuperar(sys.argv[1], RAIZ / "data")
    print(f"Recuperado do site publicado: {', '.join(res['ficheiros']) or 'nada'}; "
          f"{res['acoes']} páginas de ações")
