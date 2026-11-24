"""Traduções para português de Portugal.

1) Tabelas fixas (sem serviço externo) para setores, indústrias, países e tipos de
   instrumento, para os filtros da app ficarem em português. Termos que não estejam na
   tabela ficam em inglês e são registados em `data/meta.json` ("termos_sem_traducao").
2) Descrições das empresas: traduzidas por um serviço externo (ver `Tradutor`), uma vez por
   empresa, com cache — só se traduz de novo se o texto original mudar.
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

log = logging.getLogger(__name__)

SETORES = {
    "Basic Materials": "Materiais de Base",
    "Communication Services": "Serviços de Comunicação",
    "Consumer Cyclical": "Consumo Cíclico",
    "Consumer Defensive": "Consumo Defensivo",
    "Energy": "Energia",
    "Financial Services": "Serviços Financeiros",
    "Financial": "Serviços Financeiros",
    "Healthcare": "Saúde",
    "Industrials": "Indústria",
    "Real Estate": "Imobiliário",
    "Technology": "Tecnologia",
    "Utilities": "Serviços Públicos (Energia/Água)",
}

INDUSTRIAS = {
    # Materiais de base
    "Agricultural Inputs": "Fertilizantes e Insumos Agrícolas",
    "Aluminum": "Alumínio",
    "Building Materials": "Materiais de Construção",
    "Chemicals": "Químicos",
    "Coking Coal": "Carvão Metalúrgico",
    "Copper": "Cobre",
    "Gold": "Ouro",
    "Lumber & Wood Production": "Madeira",
    "Other Industrial Metals & Mining": "Outros Metais Industriais e Mineração",
    "Other Precious Metals & Mining": "Outros Metais Preciosos e Mineração",
    "Paper & Paper Products": "Papel e Produtos de Papel",
    "Silver": "Prata",
    "Specialty Chemicals": "Químicos Especiais",
    "Steel": "Aço",
    # Comunicação
    "Advertising Agencies": "Agências de Publicidade",
    "Broadcasting": "Rádio e Televisão",
    "Electronic Gaming & Multimedia": "Videojogos e Multimédia",
    "Entertainment": "Entretenimento",
    "Internet Content & Information": "Conteúdos e Informação na Internet",
    "Publishing": "Edição",
    "Telecom Services": "Telecomunicações",
    # Consumo cíclico
    "Apparel Manufacturing": "Fabrico de Vestuário",
    "Apparel Retail": "Retalho de Vestuário",
    "Auto & Truck Dealerships": "Concessionários Automóveis",
    "Auto Manufacturers": "Fabricantes Automóveis",
    "Auto Parts": "Componentes Automóveis",
    "Department Stores": "Grandes Armazéns",
    "Footwear & Accessories": "Calçado e Acessórios",
    "Furnishings, Fixtures & Appliances": "Mobiliário e Eletrodomésticos",
    "Gambling": "Jogo",
    "Home Improvement Retail": "Retalho de Bricolage",
    "Internet Retail": "Comércio Eletrónico",
    "Leisure": "Lazer",
    "Lodging": "Hotelaria",
    "Luxury Goods": "Bens de Luxo",
    "Packaging & Containers": "Embalagens",
    "Personal Services": "Serviços Pessoais",
    "Recreational Vehicles": "Veículos Recreativos",
    "Residential Construction": "Construção Residencial",
    "Resorts & Casinos": "Resorts e Casinos",
    "Restaurants": "Restauração",
    "Specialty Retail": "Retalho Especializado",
    "Textile Manufacturing": "Indústria Têxtil",
    "Travel Services": "Serviços de Viagens",
    # Consumo defensivo
    "Beverages - Brewers": "Bebidas - Cervejeiras",
    "Beverages - Non-Alcoholic": "Bebidas Não Alcoólicas",
    "Beverages - Wineries & Distilleries": "Bebidas - Vinhos e Destilados",
    "Confectioners": "Confeitaria",
    "Discount Stores": "Lojas de Desconto",
    "Education & Training Services": "Educação e Formação",
    "Farm Products": "Produtos Agrícolas",
    "Food Distribution": "Distribuição Alimentar",
    "Grocery Stores": "Supermercados",
    "Household & Personal Products": "Produtos de Casa e Higiene Pessoal",
    "Packaged Foods": "Alimentos Embalados",
    "Tobacco": "Tabaco",
    # Energia
    "Oil & Gas Drilling": "Petróleo e Gás - Perfuração",
    "Oil & Gas E&P": "Petróleo e Gás - Exploração e Produção",
    "Oil & Gas Equipment & Services": "Petróleo e Gás - Equipamentos e Serviços",
    "Oil & Gas Integrated": "Petróleo e Gás - Integradas",
    "Oil & Gas Midstream": "Petróleo e Gás - Transporte e Armazenagem",
    "Oil & Gas Refining & Marketing": "Petróleo e Gás - Refinação e Comercialização",
    "Thermal Coal": "Carvão Térmico",
    "Uranium": "Urânio",
    "Solar": "Energia Solar",
    # Financeiro
    "Asset Management": "Gestão de Ativos",
    "Banks - Diversified": "Bancos - Diversificados",
    "Banks - Regional": "Bancos - Regionais",
    "Capital Markets": "Mercados de Capitais",
    "Credit Services": "Serviços de Crédito",
    "Financial Conglomerates": "Conglomerados Financeiros",
    "Financial Data & Stock Exchanges": "Dados Financeiros e Bolsas",
    "Insurance - Diversified": "Seguros - Diversificados",
    "Insurance - Life": "Seguros - Vida",
    "Insurance - Property & Casualty": "Seguros - Não Vida",
    "Insurance - Reinsurance": "Resseguros",
    "Insurance - Specialty": "Seguros - Especializados",
    "Insurance Brokers": "Corretores de Seguros",
    "Mortgage Finance": "Crédito à Habitação",
    "Shell Companies": "Sociedades Veículo (SPAC)",
    # Saúde
    "Biotechnology": "Biotecnologia",
    "Diagnostics & Research": "Diagnóstico e Investigação",
    "Drug Manufacturers - General": "Farmacêuticas - Gerais",
    "Drug Manufacturers - Specialty & Generic": "Farmacêuticas - Especialidades e Genéricos",
    "Health Information Services": "Serviços de Informação de Saúde",
    "Healthcare Plans": "Seguros de Saúde",
    "Medical Care Facilities": "Hospitais e Clínicas",
    "Medical Devices": "Dispositivos Médicos",
    "Medical Distribution": "Distribuição Médica",
    "Medical Instruments & Supplies": "Instrumentos e Material Médico",
    "Pharmaceutical Retailers": "Farmácias",
    # Indústria
    "Aerospace & Defense": "Aeroespacial e Defesa",
    "Airlines": "Companhias Aéreas",
    "Airports & Air Services": "Aeroportos e Serviços Aéreos",
    "Building Products & Equipment": "Produtos e Equipamentos de Construção",
    "Business Equipment & Supplies": "Equipamentos e Material de Escritório",
    "Conglomerates": "Conglomerados",
    "Consulting Services": "Consultoria",
    "Electrical Equipment & Parts": "Equipamento Elétrico",
    "Engineering & Construction": "Engenharia e Construção",
    "Farm & Heavy Construction Machinery": "Máquinas Agrícolas e de Construção",
    "Industrial Distribution": "Distribuição Industrial",
    "Infrastructure Operations": "Gestão de Infraestruturas",
    "Integrated Freight & Logistics": "Transporte de Mercadorias e Logística",
    "Marine Shipping": "Transporte Marítimo",
    "Metal Fabrication": "Metalomecânica",
    "Pollution & Treatment Controls": "Controlo e Tratamento de Poluição",
    "Railroads": "Caminhos de Ferro",
    "Rental & Leasing Services": "Aluguer e Leasing",
    "Security & Protection Services": "Segurança e Proteção",
    "Specialty Business Services": "Serviços Especializados a Empresas",
    "Specialty Industrial Machinery": "Maquinaria Industrial Especializada",
    "Staffing & Employment Services": "Trabalho Temporário e Recrutamento",
    "Tools & Accessories": "Ferramentas e Acessórios",
    "Trucking": "Transporte Rodoviário",
    "Waste Management": "Gestão de Resíduos",
    # Imobiliário
    "Real Estate - Development": "Imobiliário - Promoção",
    "Real Estate - Diversified": "Imobiliário - Diversificado",
    "Real Estate Services": "Serviços Imobiliários",
    "REIT - Diversified": "REIT - Diversificado",
    "REIT - Healthcare Facilities": "REIT - Saúde",
    "REIT - Hotel & Motel": "REIT - Hotelaria",
    "REIT - Industrial": "REIT - Industrial e Logística",
    "REIT - Mortgage": "REIT - Hipotecário",
    "REIT - Office": "REIT - Escritórios",
    "REIT - Residential": "REIT - Residencial",
    "REIT - Retail": "REIT - Comercial (Retalho)",
    "REIT - Specialty": "REIT - Especializado",
    # Tecnologia
    "Communication Equipment": "Equipamento de Comunicações",
    "Computer Hardware": "Hardware Informático",
    "Consumer Electronics": "Eletrónica de Consumo",
    "Electronic Components": "Componentes Eletrónicos",
    "Electronics & Computer Distribution": "Distribuição de Eletrónica e Informática",
    "Information Technology Services": "Serviços de Tecnologias de Informação",
    "Scientific & Technical Instruments": "Instrumentos Científicos e Técnicos",
    "Semiconductor Equipment & Materials": "Equipamento e Materiais para Semicondutores",
    "Semiconductors": "Semicondutores",
    "Software - Application": "Software - Aplicações",
    "Software - Infrastructure": "Software - Infraestrutura",
    # Serviços públicos
    "Utilities - Diversified": "Serviços Públicos - Diversificados",
    "Utilities - Independent Power Producers": "Produtores Independentes de Eletricidade",
    "Utilities - Regulated Electric": "Eletricidade (Regulada)",
    "Utilities - Regulated Gas": "Gás (Regulado)",
    "Utilities - Regulated Water": "Água (Regulada)",
    "Utilities - Renewable": "Energias Renováveis",
}

PAISES = {
    "United States": "Estados Unidos", "Canada": "Canadá", "Mexico": "México", "Brazil": "Brasil",
    "Argentina": "Argentina", "Chile": "Chile", "Colombia": "Colômbia", "Peru": "Peru",
    "United Kingdom": "Reino Unido", "Ireland": "Irlanda", "Portugal": "Portugal", "Spain": "Espanha",
    "France": "França", "Germany": "Alemanha", "Italy": "Itália", "Netherlands": "Países Baixos",
    "Belgium": "Bélgica", "Luxembourg": "Luxemburgo", "Switzerland": "Suíça", "Austria": "Áustria",
    "Denmark": "Dinamarca", "Sweden": "Suécia", "Norway": "Noruega", "Finland": "Finlândia",
    "Iceland": "Islândia", "Poland": "Polónia", "Czech Republic": "Chéquia", "Czechia": "Chéquia",
    "Hungary": "Hungria", "Romania": "Roménia", "Greece": "Grécia", "Cyprus": "Chipre", "Malta": "Malta",
    "Slovenia": "Eslovénia", "Slovakia": "Eslováquia", "Croatia": "Croácia", "Bulgaria": "Bulgária",
    "Estonia": "Estónia", "Latvia": "Letónia", "Lithuania": "Lituânia", "Turkey": "Turquia",
    "Russia": "Rússia", "Ukraine": "Ucrânia", "Israel": "Israel", "Jersey": "Jersey",
    "Guernsey": "Guernsey", "Isle of Man": "Ilha de Man", "Bermuda": "Bermudas",
    "Cayman Islands": "Ilhas Caimão", "British Virgin Islands": "Ilhas Virgens Britânicas",
    "Monaco": "Mónaco", "Liechtenstein": "Liechtenstein", "Gibraltar": "Gibraltar",
    "China": "China", "Hong Kong": "Hong Kong", "Macau": "Macau", "Taiwan": "Taiwan", "Japan": "Japão",
    "South Korea": "Coreia do Sul", "Singapore": "Singapura", "India": "Índia", "Indonesia": "Indonésia",
    "Malaysia": "Malásia", "Thailand": "Tailândia", "Philippines": "Filipinas", "Vietnam": "Vietname",
    "Australia": "Austrália", "New Zealand": "Nova Zelândia", "South Africa": "África do Sul",
    "Egypt": "Egito", "Nigeria": "Nigéria", "Morocco": "Marrocos", "United Arab Emirates": "Emirados Árabes Unidos",
    "Saudi Arabia": "Arábia Saudita", "Qatar": "Catar", "Kazakhstan": "Cazaquistão", "Panama": "Panamá",
    "Uruguay": "Uruguai", "Puerto Rico": "Porto Rico", "Bahamas": "Baamas", "Curacao": "Curaçau",
    "Marshall Islands": "Ilhas Marshall", "Greenland": "Gronelândia", "Faroe Islands": "Ilhas Faroé",
}

TIPOS_INSTRUMENTO = {
    "EQUITY": "Ação", "ETF": "ETF", "MUTUALFUND": "Fundo", "INDEX": "Índice", "CURRENCY": "Moeda",
}


class Termos:
    """Traduz termos fixos e regista os que não estão na tabela."""

    def __init__(self):
        self.em_falta: dict[str, set[str]] = {}

    def _t(self, tabela: dict, tipo: str, valor: str | None) -> str | None:
        if not valor:
            return valor
        if valor in tabela:
            return tabela[valor]
        self.em_falta.setdefault(tipo, set()).add(valor)
        return valor

    def setor(self, v):
        return self._t(SETORES, "setor", v)

    def industria(self, v):
        return self._t(INDUSTRIAS, "industria", v)

    def pais(self, v):
        return self._t(PAISES, "pais", v)

    def tipo(self, v):
        return self._t(TIPOS_INSTRUMENTO, "tipo", v)

    def relatorio(self) -> dict[str, list[str]]:
        return {k: sorted(v) for k, v in self.em_falta.items()}


# ---------------------------------------------------------------------------
# Descrições (serviço externo + cache)
# ---------------------------------------------------------------------------

def _hash(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()[:16]


class Tradutor:
    """Interface para serviços de tradução. `traduzir` devolve o texto em pt-PT ou levanta erro."""

    nome = "nenhum"
    disponivel = False
    conta_caracteres = False  # True nos serviços que contam caracteres para a quota (Azure)

    def traduzir(self, texto: str) -> str:  # pragma: no cover - implementado nas subclasses
        raise NotImplementedError


class QuotaEsgotada(Exception):
    """O serviço disse que a quota (gratuita) acabou: parar de pedir nesta execução."""


# Limites de segurança (o plano gratuito F0 do Azure dá 2 milhões de caracteres por mês)
LIMITE_MENSAL_PADRAO = 1_500_000
LIMITE_MENSAL_MAXIMO = 1_900_000  # nunca se aceita um limite mais alto do que este
LIMITE_EXECUCAO_PADRAO = 300_000
MINUTOS_EXECUCAO_PADRAO = 15  # tempo máximo a traduzir em cada atualização


class CacheTraducoes:
    """Guarda as traduções em `pasta/traducoes.json`:
        {"versao": 2, "uso_mensal": {"2026-11": 123456}, "descricoes": {ticker: {hash, pt, servico}}}

    - Só traduz de novo quando o texto original muda (hash diferente).
    - Se a tradução falhar (ou não houver serviço), devolve o original com estado
      "indisponivel" e volta a tentar na atualização seguinte.
    - Limites: por execução e por mês (contados em caracteres do texto original, como o
      Azure conta). Ao chegar ao limite, ou se o serviço disser que a quota acabou, deixa
      de pedir traduções até à execução/mês seguinte.
    """

    def __init__(self, pasta: Path, tradutor: Tradutor | None, max_caracteres: int = LIMITE_EXECUCAO_PADRAO,
                 limite_mensal: int = LIMITE_MENSAL_PADRAO, mes: str | None = None, dados_iniciais: dict | None = None,
                 max_segundos: float | None = MINUTOS_EXECUCAO_PADRAO * 60, relogio=None):
        self.ficheiro = Path(pasta) / "traducoes.json"
        self.tradutor = tradutor
        self.restante_execucao = max_caracteres
        self.limite_mensal = min(int(limite_mensal), LIMITE_MENSAL_MAXIMO)
        self.mes = mes or __import__("datetime").date.today().strftime("%Y-%m")
        self.dados = {"versao": 2, "uso_mensal": {}, "descricoes": {}}
        bruto = None
        if self.ficheiro.exists():
            try:
                bruto = json.loads(self.ficheiro.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                bruto = None
        if bruto is None and dados_iniciais:
            bruto = dados_iniciais  # ex.: cópia publicada no site, se a cache local se perdeu
        if isinstance(bruto, dict):
            if bruto.get("versao") == 2:
                self.dados.update(bruto)
            else:  # formato antigo: {ticker: {...}}
                self.dados["descricoes"] = {k: v for k, v in bruto.items() if isinstance(v, dict)}
        self.parado = False
        self.max_segundos = max_segundos
        self._relogio = relogio or __import__("time").monotonic
        self._inicio: float | None = None  # o tempo só conta a partir da 1.ª tradução pedida
        self.tempo_esgotado = False
        self.traduzidas_agora = 0
        self.falhas_agora = 0
        self.caracteres_agora = 0

    @property
    def usado_no_mes(self) -> int:
        return int(self.dados["uso_mensal"].get(self.mes, 0))

    def _cabe(self, n: int) -> bool:
        if self.max_segundos is not None:
            if self._inicio is None:
                self._inicio = self._relogio()
            elif self._relogio() - self._inicio >= self.max_segundos:
                if not self.tempo_esgotado:
                    log.info("Tempo de tradução desta execução esgotado: o resto fica para a próxima")
                self.tempo_esgotado = True
                return False
        if not getattr(self.tradutor, "conta_caracteres", False):
            return True  # modelo local: sem quota de caracteres
        return n <= self.restante_execucao and self.usado_no_mes + n <= self.limite_mensal

    def descricao(self, ticker: str, original: str | None, so_cache: bool = False) -> dict:
        """{'texto', 'original', 'estado': 'traduzida'|'indisponivel'|'vazia', 'servico'}

        `so_cache=True`: não pede nada ao serviço (usa só traduções já guardadas)."""
        if not original:
            return {"texto": None, "original": None, "estado": "vazia", "servico": None}
        h = _hash(original)
        g = self.dados["descricoes"].get(ticker)
        if g and g.get("hash") == h and g.get("pt"):
            return {"texto": g["pt"], "original": original, "estado": "traduzida", "servico": g.get("servico")}
        n = len(original)
        if (not so_cache and not self.parado and self.tradutor and self.tradutor.disponivel and self._cabe(n)):
            try:
                pt = self.tradutor.traduzir(original)
                self._contar(n)
                self.dados["descricoes"][ticker] = {"hash": h, "pt": pt, "servico": self.tradutor.nome}
                self.traduzidas_agora += 1
                return {"texto": pt, "original": original, "estado": "traduzida", "servico": self.tradutor.nome}
            except QuotaEsgotada as e:
                log.warning("Quota de tradução esgotada (%s): sem mais traduções nesta execução", e)
                self.parado = True
                self.falhas_agora += 1
            except Exception as e:  # noqa: BLE001 — qualquer falha: mostra o original e tenta depois
                log.warning("%s: tradução falhou: %s", ticker, e)
                self.falhas_agora += 1
        return {"texto": original, "original": original, "estado": "indisponivel", "servico": None}

    def _contar(self, n: int) -> None:
        self.restante_execucao -= n
        self.caracteres_agora += n
        self.dados["uso_mensal"][self.mes] = self.usado_no_mes + n

    def resumo(self) -> dict:
        return {
            "servico": self.tradutor.nome if self.tradutor else "nenhum",
            "traduzidas_nesta_execucao": self.traduzidas_agora,
            "caracteres_nesta_execucao": self.caracteres_agora,
            "falhas": self.falhas_agora,
            "em_cache": len(self.dados["descricoes"]),
            "mes": self.mes,
            "caracteres_usados_no_mes": self.usado_no_mes,
            "limite_mensal": self.limite_mensal,
            "quota_esgotada": self.parado,
            "tempo_esgotado": self.tempo_esgotado,
            "segundos_a_traduzir": round(self._relogio() - self._inicio, 1) if self._inicio is not None else 0,
        }

    def guardar(self, copia_publica: Path | None = None) -> None:
        texto = json.dumps(self.dados, ensure_ascii=False)
        self.ficheiro.parent.mkdir(parents=True, exist_ok=True)
        self.ficheiro.write_text(texto, encoding="utf-8")
        if copia_publica:
            copia_publica.parent.mkdir(parents=True, exist_ok=True)
            copia_publica.write_text(texto, encoding="utf-8")
