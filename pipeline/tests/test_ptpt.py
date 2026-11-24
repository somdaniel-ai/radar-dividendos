from radar.ptpt import para_ptpt


def test_vocabulario_e_maiusculas():
    assert para_ptpt("O registro de usuários e o Gerenciamento de arquivos.") == \
        "O registo de utilizadores e a gestão de ficheiros."
    assert para_ptpt("Opções de treinamento; programas de graduação; controle de qualidade.") == \
        "Opções de formação; programas de licenciatura; controlo de qualidade."
    assert para_ptpt("Soluções de valor agregado por meio de parceiros.") == \
        "Soluções de valor acrescentado através de parceiros."


def test_possessivos_e_gerundio():
    assert para_ptpt("A Aperam, juntamente com suas subsidiárias, produz aço.") == \
        "A Aperam, juntamente com as suas subsidiárias, produz aço."
    assert para_ptpt("Opera em seus mercados. Suas marcas incluem X.") == \
        "Opera nos seus mercados. As suas marcas incluem X."
    assert para_ptpt("A empresa está fornecendo energia e continua construindo.") == \
        "A empresa está a fornecer energia e continua a construir."


def test_nao_estraga_o_que_ja_esta_certo():
    t = "A Time Warner gere aluguer de equipamento e a Atacadão foi atacado. Sede em Lisboa."
    assert para_ptpt(t) == t
    assert para_ptpt("ações comuns") == "ações ordinárias"
    assert para_ptpt("Atua no gerenciamento de ativos e em treinamentos.") == "Atua na gestão de ativos e em formações."
    assert para_ptpt("") == ""


def test_mais_casos_vistos_em_traducoes_reais():
    assert para_ptpt("Ele vende seus produtos e mudou seu nome.") == "Ele vende os seus produtos e mudou o seu nome."
    assert para_ptpt("A empresa se envolve na pesquisa e desenvolvimento.") == \
        "A empresa envolve-se na investigação e desenvolvimento."
    assert para_ptpt("Uma empresa que se dedica ao aço e também se concentra em tubos.") == \
        "Uma empresa que se dedica ao aço e também se concentra em tubos."
    assert para_ptpt("Produz hidrogênio, elastômeros e amônio na Polônia.") == \
        "Produz hidrogénio, elastómeros e amónio na Polónia."
    assert para_ptpt("Ciência e experiência em três países.") == "Ciência e experiência em três países."
    assert para_ptpt("A empresa foi fundada em 1825 e está sediada em Edimburgo.") == \
        "A empresa foi fundada em 1825 e tem sede em Edimburgo."
    assert para_ptpt("Opera usinas e serviços de coleta para provedores.") == \
        "Opera centrais e serviços de recolha para fornecedores."
    assert para_ptpt("Produtos de poupança e aposentadoria; possuímos e gerenciamos imóveis.") == \
        "Produtos de poupança e reforma; possuímos e gerimos imóveis."
