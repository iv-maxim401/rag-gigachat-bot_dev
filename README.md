# RAG Answer Bot

This project uses ChromaDB and GigaChat/OpenRouter to perform Retrieval-Augmented Generation (RAG).

## Setup

### Node.js
```bash
git clone https://github.com/iv-maxim401/rag-gigachat-bot_dev.git

cd rag-gigachat-bot_dev

npm install
```

4. ⚙️ Set up .env file
If your project uses environment variables, create a .env file in the root folder and add your keys:

.env ( example )
EMBEDDING_PROVIDER=GIGACHAT
GIGACHAT_API_KEY=your-key-here
CHROMA_URL=http://localhost:8000/api/v2
CHROMA_TENANT=my-tenant-init
CHROMA_DATABASE=my-bet-database
CHROMA_COLLECTION=gigachat_embeddings
Adjust values as needed.

### Python
```bash
python -m venv chroma-env
source chroma-env/bin/activate     #( win: chroma-env\Scripts\activate )
pip install -r requirements.txt
chroma run --host 0.0.0.0 --port 8000
```
## Workflow

### Create embeddings DB

```bash
node embed_chunks.js
```

### Call prompt

```bash
node answer_prompt.js "какие бк работают с google pay?"
```