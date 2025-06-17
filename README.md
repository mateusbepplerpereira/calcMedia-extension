# Calculadora de Média do Módulo

## Instalação

Como esta extensão não está disponível na Chrome Web Store, você precisará instalá-la no modo desenvolvedor. Siga os passos abaixo:

### 1. Clone o repositório
```bash
git clone https://github.com/mateusbepplerpereira/calcMedia-extension.git
```

### 2. Carregue a extensão no Chrome
1. Abra o Chrome
2. Navegue para `chrome://extensions/`
3. Ative o "Modo desenvolvedor" no canto superior direito
4. Clique em "Carregar sem compactação"
5. Selecione a pasta do repositório clonado

## Como Usar

1. Acesse a plataforma da Adalove
2. Navegue até a página que contém a tabela de notas
3. Clique no ícone da extensão na barra de ferramentas do navegador
4. A extensão carregará automaticamente suas tarefas e mostrará sua média atual
5. A média será recalculada automaticamente a cada modificação

## Personalização

Você pode personalizar a extensão editando os seguintes arquivos:

- `popup.html`: Para modificar a interface
- `popup.js`: Para alterar a lógica de cálculo ou extração de dados
- `manifest.json`: Para alterar permissões ou metadados da extensão