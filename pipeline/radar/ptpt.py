"""Correções para aproximar o texto traduzido do português de Portugal.

O modelo OPUS-MT aprendeu com muito português do Brasil. Estas regras corrigem os casos
mais comuns nas descrições de empresas (vistos em traduções reais). São aplicadas depois
da tradução e respeitam maiúsculas ("Registro" → "Registo").

Para acrescentar uma correção: juntar uma linha a PALAVRAS (palavra inteira) ou a
EXPRESSOES (várias palavras). Evitar palavras que também existem em pt-PT com outro
sentido (ex.: "time" em "Time Warner", "atacado" = atacado). Testes: tests/test_ptpt.py.
"""
from __future__ import annotations

import re

# expressões (várias palavras); aplicadas antes das palavras soltas
EXPRESSOES = {
    "ações comuns": "ações ordinárias",
    "ação comum": "ação ordinária",
    "estoque de ações": "ações",
    "valor agregado": "valor acrescentado",
    "por meio de": "através de",
    "indivíduos privados": "particulares",
    "de fato": "de facto",
    "por atacado": "por grosso",
    "Nova York": "Nova Iorque",
    "está sediada em": "tem sede em", "está sediado em": "tem sede em",
    "estão sediadas em": "têm sede em", "estão sediados em": "têm sede em",
    "sediada em": "com sede em", "sediado em": "com sede em",
    "clientes corporativos": "clientes empresariais", "cliente corporativo": "cliente empresarial",
    "clientes de atacado": "clientes grossistas", "retalho e atacado": "retalho e por grosso",
    "pesquisa e desenvolvimento": "investigação e desenvolvimento",
    "gerentes de relacionamento": "gestores de cliente",
    "planta de processamento": "instalação de processamento", "plantas de processamento": "instalações de processamento",
    "uma planta de": "uma instalação de",
    # palavras que mudam de género (o gerenciamento → a gestão; o treinamento → a formação)
    **{f"{art} {br}": f"{pt_art} {pt}" for br, pt, arts in (
        ("gerenciamento", "gestão", None), ("treinamento", "formação", None)) for art, pt_art in (
        ("o", "a"), ("do", "da"), ("no", "na"), ("pelo", "pela"), ("ao", "à"), ("um", "uma"), ("seu", "sua"))},
    **{f"{art} treinamentos": f"{pt_art} formações" for art, pt_art in (
        ("os", "as"), ("dos", "das"), ("nos", "nas"), ("pelos", "pelas"), ("aos", "às"), ("seus", "suas"))},
    # em pt-PT o possessivo leva artigo: "com suas filiais" → "com as suas filiais"
    "com suas": "com as suas", "com seus": "com os seus", "com sua": "com a sua", "com seu": "com o seu",
    "de suas": "das suas", "de seus": "dos seus", "de sua": "da sua", "de seu": "do seu",
    "em suas": "nas suas", "em seus": "nos seus", "em sua": "na sua", "em seu": "no seu",
    "por suas": "pelas suas", "por seus": "pelos seus", "por sua": "pela sua", "por seu": "pelo seu",
    "para suas": "para as suas", "para seus": "para os seus", "para sua": "para a sua", "para seu": "para o seu",
    "a suas": "às suas", "a seus": "aos seus",
    "e suas": "e as suas", "e seus": "e os seus",
}

# palavra do Brasil → palavra de Portugal (só palavras inteiras)
PALAVRAS = {
    # vocabulário
    "registro": "registo", "registros": "registos", "registrada": "registada", "registradas": "registadas",
    "registrado": "registado", "registrados": "registados", "registrar": "registar", "registrou": "registou",
    "usuário": "utilizador", "usuários": "utilizadores",
    "arquivo": "ficheiro", "arquivos": "ficheiros",
    "tela": "ecrã", "telas": "ecrãs",
    "celular": "telemóvel", "celulares": "telemóveis",
    "trem": "comboio", "trens": "comboios",
    "ônibus": "autocarros",
    "caminhão": "camião", "caminhões": "camiões",
    "equipe": "equipa", "equipes": "equipas",
    "esporte": "desporto", "esportes": "desportos", "esportivo": "desportivo", "esportivos": "desportivos",
    "esportiva": "desportiva", "esportivas": "desportivas",
    "aluguel": "aluguer", "aluguéis": "alugueres",
    "gerenciamento": "gestão", "gerenciar": "gerir", "gerencia": "gere", "gerenciam": "gerem",
    "gerenciado": "gerido", "gerenciados": "geridos", "gerenciada": "gerida", "gerenciadas": "geridas",
    "planejamento": "planeamento", "planejar": "planear",
    "treinamento": "formação", "treinamentos": "formações",
    "graduação": "licenciatura",
    "controle": "controlo", "controles": "controlos",
    "cadastro": "registo", "cadastros": "registos",
    "contato": "contacto", "contatos": "contactos",
    "seção": "secção", "seções": "secções",
    "fato": "facto", "fatos": "factos",
    "estoque": "inventário", "estoques": "inventários",
    "varejo": "retalho", "varejista": "retalhista", "varejistas": "retalhistas",
    "atacadista": "grossista", "atacadistas": "grossistas",
    "banheiro": "casa de banho", "banheiros": "casas de banho",
    "geladeira": "frigorífico", "geladeiras": "frigoríficos",
    "pedágio": "portagem", "pedágios": "portagens",
    "mídia": "media", "mídias": "media", "multimídia": "multimédia",
    "canadense": "canadiano", "canadenses": "canadianos",
    "gerenciamos": "gerimos", "gerenciando": "gerindo", "gerenciou": "geriu",
    "autogerenciada": "autogerida", "autogerenciado": "autogerido",
    "gerente": "gestor", "gerentes": "gestores",
    "aposentadoria": "reforma", "aposentadorias": "reformas",
    "provedor": "fornecedor", "provedores": "fornecedores",
    "usina": "central", "usinas": "centrais",
    "coleta": "recolha", "coletas": "recolhas", "coletar": "recolher", "coleta-se": "recolhe-se",
    "descarte": "eliminação",
    "dutos": "condutas", "duto": "conduta",
    "contêiner": "contentor", "contêineres": "contentores",
    "suco": "sumo", "sucos": "sumos",
    "terceirizados": "externos", "terceirizadas": "externas", "terceirização": "subcontratação",
    "fabricação": "fabrico",
    "Polônia": "Polónia",
    "projetado": "concebido", "projetados": "concebidos", "projetada": "concebida", "projetadas": "concebidas",
    # acentuação do Brasil → de Portugal
    "econômico": "económico", "econômica": "económica", "econômicos": "económicos", "econômicas": "económicas",
    "eletrônico": "eletrónico", "eletrônica": "eletrónica", "eletrônicos": "eletrónicos", "eletrônicas": "eletrónicas",
    "telefônico": "telefónico", "telefônica": "telefónica", "telefônicos": "telefónicos", "telefônicas": "telefónicas",
    "agronômico": "agronómico", "autônomo": "autónomo", "autônoma": "autónoma", "autônomos": "autónomos",
    "autônomas": "autónomas", "icônico": "icónico", "icônica": "icónica", "icônicos": "icónicos", "icônicas": "icónicas",
    "crônico": "crónico", "crônica": "crónica", "crônicas": "crónicas", "crônicos": "crónicos",
    "anônimo": "anónimo", "anônima": "anónima", "ergonômico": "ergonómico", "gastronômico": "gastronómico",
    "quilômetro": "quilómetro", "quilômetros": "quilómetros",
    "gênero": "género", "gêneros": "géneros", "prêmio": "prémio", "prêmios": "prémios",
    "fenômeno": "fenómeno", "fenômenos": "fenómenos", "tênis": "ténis",
    "patrimônio": "património", "patrimônios": "patrimónios",
    "acadêmico": "académico", "acadêmica": "académica", "acadêmicos": "académicos", "acadêmicas": "académicas",
    "bebê": "bebé", "bebês": "bebés", "hormônio": "hormona", "hormônios": "hormonas",
    "amônia": "amónia", "sênior": "sénior", "colônia": "colónia",
    "bônus": "bónus", "ônus": "ónus", "Antônio": "António",
    "biotecnológico": "biotecnológico",
}

# Acentuação do Brasil em terminações (hidrogênio → hidrogénio, elastômero → elastómero, …).
# "ciência", "três", "têm"… não são tocados (são iguais em pt-PT).
_TERMINACOES = re.compile(r"(\w)(ê|ô)(nio|nios|nico|nica|nicos|nicas|mico|mica|micos|micas|mero|meros|nimo|nima|nimos|nimas|nomo|noma|nomos|nomas)\b")
_AGUDO = {"ê": "é", "ô": "ó"}

# Possessivo sem artigo ("vende seus produtos" → "vende os seus produtos"), exceto depois de
# artigos e preposições (esses casos já estão em EXPRESSOES ou já têm artigo).
_POSSESSIVO = re.compile(
    r"(?<!\bo )(?<!\ba )(?<!\bos )(?<!\bas )(?<!\bdo )(?<!\bda )(?<!\bdos )(?<!\bdas )(?<!\bno )(?<!\bna )"
    r"(?<!\bnos )(?<!\bnas )(?<!\bpelo )(?<!\bpela )(?<!\bpelos )(?<!\bpelas )(?<!\bao )(?<!\bà )(?<!\baos )"
    r"(?<!\bàs )(?<!\bum )(?<!\buma )\b(seus|suas|seu|sua)\b", re.IGNORECASE)
_ART_POSS = {"seus": "os seus", "suas": "as suas", "seu": "o seu", "sua": "a sua"}

# Pronome antes do verbo à moda do Brasil ("se envolve" → "envolve-se"), exceto quando em pt-PT
# também vai antes ("que se dedica", "também se concentra", "não se…").
_VERBOS_SE = r"(envolve|envolvem|dedica|dedicam|concentra|concentram|especializa|especializam|destina|destinam|localiza|localizam|compromete|comprometem)"
_PROCLISE = re.compile(rf"(?<!\bque )(?<!\bnão )(?<!\btambém )(?<!\bainda )(?<!\bjá )(?<!\bonde )(?<!\bquando )(?<!\bsó )\bse {_VERBOS_SE}\b")

# Gerúndio do Brasil depois de "está/estão/continua…": "está fornecendo" → "está a fornecer"
_AUXILIARES = r"(está|estão|estava|estavam|continua|continuam|anda|andam)"
_GERUNDIO = re.compile(rf"\b{_AUXILIARES}\s+(\w+?)ndo\b", re.IGNORECASE)
_SUAS_INICIO = re.compile(r"(^|[.;:]\s+)(Suas|Seus|Sua|Seu)\b")
_ARTIGO = {"Suas": "As suas", "Seus": "Os seus", "Sua": "A sua", "Seu": "O seu"}


def _com_maiusculas(original: str, novo: str) -> str:
    if original.isupper() and len(original) > 1:
        return novo.upper()
    if original[:1].isupper():
        return novo[:1].upper() + novo[1:]
    return novo


def _regra(tabela: dict[str, str]):
    pares = {k: v for k, v in tabela.items() if k != v}
    chaves = sorted(pares, key=len, reverse=True)
    padrao = re.compile(r"(?<!\w)(" + "|".join(re.escape(k) for k in chaves) + r")(?!\w)", re.IGNORECASE)
    minusc = {k.lower(): v for k, v in pares.items()}
    return lambda texto: padrao.sub(lambda m: _com_maiusculas(m.group(0), minusc[m.group(0).lower()]), texto)


_EXPRESSOES = _regra(EXPRESSOES)
_PALAVRAS = _regra(PALAVRAS)


def para_ptpt(texto: str) -> str:
    if not texto:
        return texto
    texto = _EXPRESSOES(texto)
    texto = _PALAVRAS(texto)
    texto = _GERUNDIO.sub(lambda m: f"{m.group(1)} a {m.group(2)}r", texto)
    texto = _SUAS_INICIO.sub(lambda m: m.group(1) + _ARTIGO[m.group(2)], texto)
    texto = _TERMINACOES.sub(lambda m: m.group(1) + _AGUDO[m.group(2)] + m.group(3), texto)
    texto = _POSSESSIVO.sub(lambda m: _com_maiusculas(m.group(1), _ART_POSS[m.group(1).lower()]), texto)
    texto = _PROCLISE.sub(lambda m: f"{m.group(1)}-se", texto)
    return texto
