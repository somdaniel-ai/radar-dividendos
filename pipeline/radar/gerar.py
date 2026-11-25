"""Programa principal do pipeline: descarrega, calcula e gera os ficheiros JSON.

Uso (dentro da pasta `pipeline`):
    python -m radar.gerar                 # todas as ações do universo
    python -m radar.gerar --tickers KO.US,NOS.PT   # só estas; as restantes mantêm-se no radar
    python -m radar.gerar --limite 10     # só as 10 primeiras (para testar)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests

from . import universo as uni
from . import xtb
from .agenda import Triagem
from .analisar import analisar
from .cache import Cache
from .fornecedores import ErroFornecedor, Fornecedor
from .fornecedores.base import Bloqueado
from .fornecedores.yahoo import Yahoo
from .parametros import parametros
from .traducoes import CacheTraducoes, Termos, Tradutor
from .tradutores import criar_tradutor, limite_mensal, minutos_traducao

log = logging.getLogger("radar")
RAIZ = Path(__file__).resolve().parents[2]
LISBOA = ZoneInfo("Europe/Lisbon")


def _escrever(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":"), default=str),
                       encoding="utf-8")


def _ler_json(caminho: Path, padrao):
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return padrao


def _normalizar(texto: str | None) -> str:
    t = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", " ", t)


def _primeira_palavra(nome: str | None) -> str | None:
    for p in _normalizar(nome).split():
        if len(p) >= 3 and p not in {"the", "inc", "corp", "group", "grp", "sa", "ag", "plc"}:
            return p
    return None


def _descobrir(f: Fornecedor, cache: Cache, item: dict, hoje: dt.date, pasta_universo: Path):
    """Se o símbolo convertido falhar, pesquisa no Yahoo pelo ticker e pelo nome (como o
    `DescobrirsufixoYahoo` do Excel) e guarda o resultado para não repetir."""
    base = item["ticker_xtb"].rsplit(".", 1)[0]
    candidatos = []
    for texto in (base, item.get("nome")):
        if texto:
            candidatos += [c for c in f.procurar(texto) if c.get("simbolo")]
    # só aceitamos resultados cujo nome tenha a 1.ª palavra do nome da empresa
    # (evita trocar a Roche "ROG" pela Rogers Corp., por exemplo)
    palavra = _primeira_palavra(item.get("nome"))
    if palavra:
        candidatos = [c for c in candidatos if palavra in _normalizar(c["nome"])]
    simbolos = [c["simbolo"] for c in candidatos]
    preferidos = [s for s in simbolos if s.split(".")[0].upper() == base.upper()]
    for simbolo in dict.fromkeys(preferidos + simbolos):
        try:
            precos, div = cache.historico(simbolo, hoje)
            uni.guardar_descoberto(item["ticker_xtb"], simbolo, pasta_universo)
            log.info("%s: símbolo descoberto -> %s", item["ticker_xtb"], simbolo)
            return simbolo, precos, div
        except ErroFornecedor:
            continue
    raise ErroFornecedor("Símbolo não encontrado no Yahoo")


URL_PUBLICA = os.environ.get("RADAR_URL_PUBLICA", "https://somdaniel-ai.github.io/radar-dividendos/data/")


def _traducoes_guardadas(saida: Path, pasta_cache: Path) -> dict | None:
    """Traduções já feitas, se a cache local não as tiver: cópia em data/ ou no site publicado."""
    if (pasta_cache / "traducoes.json").exists():
        return None  # a cache local é lida pelo próprio CacheTraducoes
    local = _ler_json(saida / "traducoes.json", None)
    if local:
        return local
    if not URL_PUBLICA:
        return None
    try:
        r = requests.get(URL_PUBLICA + "traducoes.json", timeout=20)
        if r.ok:
            log.info("Traduções recuperadas do site publicado")
            return r.json()
    except (requests.RequestException, ValueError) as e:
        log.info("Sem traduções publicadas para recuperar: %s", e)
    return None


def _aplicar_descricao(detalhe: dict, desc: dict) -> None:
    detalhe["descricao"] = desc["texto"]
    detalhe["descricao_original"] = desc["original"] if desc["estado"] == "traduzida" else None
    detalhe["descricao_estado"] = desc["estado"]
    detalhe["descricao_servico"] = desc["servico"]


def _em_portugues(perfil: dict, termos: Termos) -> dict:
    """Setor, indústria, país e tipo em português (tabela fixa); guarda os originais."""
    return {
        **perfil,
        "setor": termos.setor(perfil.get("setor")),
        "industria": termos.industria(perfil.get("industria")),
        "pais": termos.pais(perfil.get("pais")),
        "tipo_instrumento": termos.tipo(perfil.get("tipo_yahoo")),
        "setor_original": perfil.get("setor"),
        "industria_original": perfil.get("industria"),
        "pais_original": perfil.get("pais"),
    }


def _cotacao_xtb(f: Fornecedor, cache: Cache, item: dict, agora: dt.datetime) -> dict | None:
    """Cotação da linha que existe na XTB, quando os dados de rendimento vêm de outra bolsa
    (ex.: Telus: dados de T.TO em CAD, mas na XTB é TU.US em USD)."""
    simbolo = item.get("ticker_yahoo_xtb")
    if not simbolo or simbolo == item["ticker_yahoo"]:
        return None
    try:
        pf = cache.perfil(simbolo, agora)
        return {"simbolo": simbolo, "preco": pf.get("preco"), "moeda": pf.get("moeda"),
                "variacao_dia": pf.get("variacao_dia"), "cambio_eur": f.obter_cambio(pf.get("moeda"))}
    except ErroFornecedor as e:
        log.warning("%s: cotação XTB (%s) indisponível: %s", item["ticker_xtb"], simbolo, e)
        return None


def _minutos_dados() -> float:
    try:
        return float(os.environ.get("RADAR_MINUTOS_DADOS") or 180)
    except ValueError:
        return 180


def _verificar_rapido(f: Fornecedor, cache: Cache, item: dict, hoje: dt.date, pasta_universo: Path,
                      meses: int) -> tuple[str, bool]:
    """Triagem de um instrumento novo: só os últimos ~2 anos (pedido leve).
    Devolve (símbolo Yahoo que funcionou, pagou dividendos nos últimos `meses`)."""
    desde = hoje - dt.timedelta(days=meses * 31 + 30)
    limite = pd.Timestamp(hoje) - pd.DateOffset(months=meses)
    for simbolo in dict.fromkeys(s for s in (item.get("ticker_yahoo"), item.get("alternativa_yahoo")) if s):
        try:
            _, div = f.obter_historico(simbolo, desde)
            return simbolo, bool(len(div) and div.index.max() > limite)
        except Bloqueado:
            raise
        except ErroFornecedor:
            continue
    simbolo, _, div = _descobrir(f, cache, item, hoje, pasta_universo)
    return simbolo, bool(len(div) and div.index.max() > limite)


def executar(saida: Path, tickers: list[str] | None = None, limite: int | None = None,
             fornecedor: Fornecedor | None = None, pasta_cache: Path | None = None,
             pasta_universo: Path | None = None, agora: dt.datetime | None = None,
             tradutor: Tradutor | None = None, lista_xtb: list[dict] | None = None,
             minutos: float | None = None, pausa_bloqueio: float = 120) -> dict:
    """Atualiza os instrumentos e grava os JSON.

    Sem `tickers`/`limite`: segue a agenda da triagem (radar primeiro, depois os novos e os a
    rever) até acabar o tempo (`minutos`, padrão 180 ou RADAR_MINUTOS_DADOS). O que não couber
    fica para a próxima execução. As ações do radar que não foram atualizadas mantêm-se tal
    como estavam (marcadas como desatualizadas se tiverem mais de 2 dias).
    Se o Yahoo bloquear pedidos: pausa de `pausa_bloqueio` segundos; ao 3.º bloqueio para.
    """
    inicio = time.time()
    agora = agora or dt.datetime.now(LISBOA)
    hoje = agora.date()
    p = parametros()
    meses = p["universo"]["meses_sem_dividendo_para_excluir"]
    f = fornecedor or Yahoo()
    pasta_universo = pasta_universo or uni.PASTA
    cache = Cache(pasta_cache or (RAIZ / "pipeline" / "cache"), f)
    triagem = Triagem(cache.pasta)
    if not triagem.dados:  # cache perdida: recupera a triagem a partir da última versão publicada
        n = triagem.recuperar(_ler_json(saida / "universo.json", {}))
        if n:
            log.warning("Triagem recuperada de data/universo.json (%s instrumentos)", n)
    extras = uni.ler_extraordinarios(pasta_universo)
    rejeitados = uni.ler_rejeitados(pasta_universo)
    termos = Termos()
    trad = CacheTraducoes(cache.pasta, tradutor if tradutor is not None else criar_tradutor(),
                          limite_mensal=limite_mensal(), mes=hoje.strftime("%Y-%m"),
                          max_segundos=minutos_traducao() * 60,
                          dados_iniciais=_traducoes_guardadas(saida, cache.pasta))
    pendentes_traducao: dict[str, str] = {}

    if lista_xtb is None:
        usar = (os.environ.get("RADAR_LISTA_XTB") or "").strip().lower() in ("sim", "1", "true")
        lista_xtb = xtb.obter_lista(cache.pasta / "xtb", hoje) if usar else []
    todos, resumo_universo = uni.universo_completo(pasta_universo, lista_xtb)
    for i in todos:  # símbolos que já funcionaram antes (descobertos por pesquisa ou alternativa)
        guardado = triagem.simbolo(i["ticker_xtb"])
        if guardado and not i.get("ticker_yahoo_forcado") and guardado != i["ticker_yahoo"]:
            if i["ticker_yahoo_xtb"] == i["ticker_yahoo"]:
                i["ticker_yahoo_xtb"] = guardado
            i["ticker_yahoo"] = guardado
    no_universo = {i["ticker_xtb"] for i in todos}
    antigo_radar = {a["ticker"]: a for a in _ler_json(saida / "radar.json", {}).get("acoes", [])}
    antigo_meta = _ler_json(saida / "meta.json", {})

    if tickers:
        pedidos = {t.upper() for t in tickers}
        itens = [i for i in todos if i["ticker_xtb"] in pedidos]
        for t in sorted(pedidos - no_universo):
            log.warning("%s não está no universo — ignorado", t)
    elif limite:
        itens = todos[:limite]
    else:
        itens = triagem.ordem(todos, hoje, {t: a.get("atualizado_em", "") for t, a in antigo_radar.items()})
    agendados = len(itens)
    prazo = None if (tickers or limite) else inicio + (minutos if minutos is not None else _minutos_dados()) * 60

    novos, sem_dividendos, erros, processados = {}, [], [], set()
    bloqueios, interrompido = 0, None
    n = 0
    while n < len(itens):
        item = itens[n]
        if prazo and time.time() > prazo:
            interrompido = "tempo"
            log.warning("Tempo esgotado: faltam %s instrumentos, ficam para a próxima execução", len(itens) - n)
            break
        n += 1
        t = item["ticker_xtb"]
        log.info("[%s/%s] %s (%s)", n, len(itens), t, item["ticker_yahoo"])
        conhecido = triagem.no_radar(t) or t in antigo_radar
        try:
            if not item["ticker_yahoo"]:
                item["ticker_yahoo"], _, _ = _descobrir(f, cache, item, hoje, pasta_universo)
            if not conhecido:  # instrumento novo ou a rever: verificação leve primeiro
                simbolo, pagou = _verificar_rapido(f, cache, item, hoje, pasta_universo, meses)
                if simbolo != item["ticker_yahoo"]:
                    if item.get("ticker_yahoo_xtb") == item["ticker_yahoo"]:
                        item["ticker_yahoo_xtb"] = simbolo
                    item["ticker_yahoo"] = simbolo
                if not pagou:
                    triagem.marcar(t, "sem_dividendos", hoje, simbolo)
                    processados.add(t)
                    sem_dividendos.append(t)
                    continue
            try:
                precos, div = cache.historico(item["ticker_yahoo"], hoje)
            except Bloqueado:
                raise
            except ErroFornecedor:
                item["ticker_yahoo"], precos, div = _descobrir(f, cache, item, hoje, pasta_universo)
            perfil = _em_portugues(cache.perfil(item["ticker_yahoo"], agora), termos)
            fx = f.obter_cambio(perfil.get("moeda"))
            r = analisar(item, precos, div, perfil, fx, hoje, p, extras.get(t),
                         _cotacao_xtb(f, cache, item, agora), rejeitados.get(t))
            # a mesma empresa noutras bolsas/moedas da XTB (mesmo ISIN), com a versão em EUR primeiro
            if item.get("versoes_xtb"):
                r["detalhe"]["versoes_xtb"] = item["versoes_xtb"]
            # nesta fase só se usam traduções já guardadas; as novas são pedidas no fim,
            # pela ordem da pontuação (as ações do topo do radar primeiro)
            desc = trad.descricao(t, perfil.get("descricao"), so_cache=True)
            _aplicar_descricao(r["detalhe"], desc)
            if desc["estado"] == "indisponivel":
                pendentes_traducao[t] = perfil["descricao"]
        except Bloqueado as e:
            bloqueios += 1
            n -= 1  # o mesmo instrumento fica por fazer (ou é tentado outra vez)
            if bloqueios >= 3:
                interrompido = "bloqueio"
                log.error("O Yahoo continua a recusar pedidos (%s): paro por hoje", e)
                break
            log.warning("O Yahoo está a recusar pedidos (%s): pausa de %s s", e, pausa_bloqueio)
            time.sleep(pausa_bloqueio)
            continue
        except Exception as e:  # noqa: BLE001 — um instrumento nunca pode parar o pipeline
            log.error("%s: %s", t, e)
            processados.add(t)
            nao_encontrado = isinstance(e, ErroFornecedor) and "não encontrado" in str(e)
            if nao_encontrado and not conhecido:
                # instrumento novo que o Yahoo não tem: só fica contado na triagem (são muitos)
                triagem.marcar(t, "sem_simbolo", hoje, erro=str(e))
                continue
            triagem.marcar(t, "erro", hoje, erro=str(e))
            erros.append({"ticker": t, "ticker_yahoo": item.get("ticker_yahoo"), "erro": str(e)})
            continue
        processados.add(t)
        if not r["resumo"]["pagou_recentemente"]:
            triagem.marcar(t, "sem_dividendos", hoje, item["ticker_yahoo"])
            sem_dividendos.append(t)
            cache.apagar(item["ticker_yahoo"])
            (saida / "acoes" / f"{t}.json").unlink(missing_ok=True)
            continue
        triagem.marcar(t, "dividendos", hoje, item["ticker_yahoo"])
        r["resumo"]["atualizado_em"] = agora.isoformat(timespec="seconds")
        r["detalhe"]["atualizado_em"] = r["resumo"]["atualizado_em"]
        r["resumo"]["desatualizado"] = False
        _escrever(saida / "acoes" / f"{t}.json", r["detalhe"])
        novos[t] = r["resumo"]
    triagem.guardar()

    com_erro = {e["ticker"] for e in erros}
    resultado = dict(novos)
    # o que não foi atualizado agora (ou falhou) mantém a versão anterior, se ainda estiver no universo
    for t, a in antigo_radar.items():
        if t in resultado or t not in no_universo or (t in processados and t not in com_erro):
            continue
        try:
            idade = (agora - dt.datetime.fromisoformat(a.get("atualizado_em") or "")).total_seconds() / 86400
        except (ValueError, TypeError):
            idade = 99
        resultado[t] = {**a, "desatualizado": t in com_erro or idade > 2}
    resumos = sorted(resultado.values(), key=lambda x: x["pontuacao"]["total"], reverse=True)
    for i, r in enumerate(resumos, 1):
        r["posicao_ranking"] = i
    for t in set(antigo_radar) - set(resultado):
        (saida / "acoes" / f"{t}.json").unlink(missing_ok=True)

    # traduções novas: primeiro as ações com melhor pontuação, até aos limites de segurança
    for r in resumos:
        t = r["ticker"]
        if t not in pendentes_traducao or t not in novos:
            continue
        desc = trad.descricao(t, pendentes_traducao[t])
        if desc["estado"] == "traduzida":
            ficheiro = saida / "acoes" / f"{t}.json"
            detalhe = _ler_json(ficheiro, None)
            if detalhe:
                _aplicar_descricao(detalhe, desc)
                _escrever(ficheiro, detalhe)
        if trad.parado:
            break

    # erros de execuções anteriores que ainda não foram resolvidos
    erros = [e for e in antigo_meta.get("erros", []) if e["ticker"] not in processados
             and e["ticker"] in no_universo and triagem.estado(e["ticker"]) == "erro"] + erros
    manuais = {i["ticker_xtb"] for i in todos if i.get("origem") == "manual"}
    sem_div_manual = sorted(t for t in manuais if triagem.estado(t) == "sem_dividendos")
    completa = not interrompido and not tickers and not limite

    cambios = _ler_json(saida / "cambios.json", {}).get("eur_por_unidade", {})
    for m in sorted({r["moeda"] for r in novos.values() if r.get("moeda")}
                    | {r["cotacao_xtb"]["moeda"] for r in novos.values() if r.get("cotacao_xtb", {}).get("moeda")}):
        cambios[m] = f.obter_cambio(m)

    meta = {
        "gerado_em": agora.isoformat(timespec="seconds"),
        "data_referencia": hoje.isoformat(),
        "fornecedor": f.nome,
        "tipo_atualizacao": "completa" if completa else "parcial",
        "atualizados_nesta_execucao": sorted(novos),
        "ultima_atualizacao_completa": (agora.isoformat(timespec="seconds") if completa
                                        else antigo_meta.get("ultima_atualizacao_completa")),
        "total_universo": len(todos),
        "total_radar": len(resumos),
        # só os da lista manual (os da lista XTB sem dividendos são milhares: ficam só contados)
        "sem_dividendos_recentes": sem_div_manual,
        "universo": resumo_universo,
        "triagem": {"agendados": agendados, "processados": len(processados),
                    "por_processar": agendados - len(processados), "interrompido": interrompido,
                    "sem_dividendos_nesta_execucao": len(sem_dividendos),
                    "estados": triagem.contagem()},
        "erros": erros[-500:],
        "duracao_segundos": round(time.time() - inicio, 1),
        "aviso": "Ferramenta de apoio pessoal. Não constitui aconselhamento financeiro nem fiscal.",
    }
    # lista de possíveis extraordinários (a confirmar ou rejeitar nas Definições da app)
    suspeitos = [{"ticker": r["ticker"], "nome": r["nome"], "moeda": r["moeda"], **s}
                 for r in resumos for s in r.get("extraordinarios_suspeitos", [])]
    meta["total_extraordinarios_suspeitos"] = len(suspeitos)
    # a cópia pública (data/traducoes.json) permite recuperar as traduções e a contagem do mês
    # se a cache local do GitHub se perder, sem gastar a quota outra vez
    trad.guardar(copia_publica=saida / "traducoes.json")
    meta["traducoes"] = trad.resumo()
    meta["traducoes"]["por_traduzir"] = sum(1 for r in resumos if r["ticker"] in pendentes_traducao
                                            and r["ticker"] not in trad.dados["descricoes"])
    meta["termos_sem_traducao"] = termos.relatorio()
    _escrever(saida / "extraordinarios_suspeitos.json", {"gerado_em": meta["gerado_em"], "suspeitos": suspeitos})
    _escrever(saida / "radar.json", {"gerado_em": meta["gerado_em"], "acoes": resumos})
    # estado de cada instrumento do universo (para o ecrã "Universo" da app)
    no_radar = {r["ticker"] for r in resumos}
    _escrever(saida / "universo.json", {"gerado_em": meta["gerado_em"], "instrumentos": {
        i["ticker_xtb"]: {"n": i.get("nome") or "", "o": "manual" if i.get("origem") == "manual" else "xtb",
                          "e": "radar" if i["ticker_xtb"] in no_radar else (triagem.estado(i["ticker_xtb"]) or "por_verificar")}
        for i in todos}})
    _escrever(saida / "cambios.json", {"gerado_em": meta["gerado_em"], "base": "EUR",
                                       "eur_por_unidade": cambios})
    _escrever(saida / "meta.json", meta)
    _escrever(saida / "definicoes_padrao.json", p)
    return meta


def main(argv=None):
    ap = argparse.ArgumentParser(description="Gera os dados do Radar de Dividendos.")
    ap.add_argument("--saida", default=str(RAIZ / "data"), help="pasta onde gravar os JSON")
    ap.add_argument("--tickers", help="lista separada por vírgulas (tickers XTB)")
    ap.add_argument("--limite", type=int)
    a = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # acentos no terminal do Windows
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        stream=sys.stdout)
    logging.getLogger("yfinance").setLevel(logging.CRITICAL)
    meta = executar(Path(a.saida), a.tickers.split(",") if a.tickers else None, a.limite)
    print(f"\nConcluído ({meta['tipo_atualizacao']}): {len(meta['atualizados_nesta_execucao'])} "
          f"atualizadas, {meta['total_radar']} no radar, {len(meta['sem_dividendos_recentes'])} sem "
          f"dividendos recentes, {len(meta['erros'])} erros, {meta['duracao_segundos']} s.")
    for e in meta["erros"]:
        print(f"  ERRO {e['ticker']}: {e['erro']}")


if __name__ == "__main__":
    main()
