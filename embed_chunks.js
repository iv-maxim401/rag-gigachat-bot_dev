require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

// Disable TLS certificate validation (for dev only)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const embeddingProvider = process.env.EMBEDDING_PROVIDER;
const useChromaDB = process.env.USE_CHROMA_DB === 'true';
const chunkSize = parseInt(process.env.CHUNK_SIZE || '1000');
const chunkOverlap = parseInt(process.env.CHUNK_OVERLAP || '200');

const chromaBase = process.env.CHROMA_URL || 'http://localhost:8000/api/v2';
const tenant = process.env.CHROMA_TENANT || 'default-tenant';
const database = process.env.CHROMA_DATABASE || 'default-db';
const collectionName = process.env.CHROMA_COLLECTION || 'gigachat_embeddings';

async function ensureTenantAndDatabase() {
  console.log('🔧 ensureTenantAndDatabase() starting...');
  try {
    await axios.post(`${chromaBase}/tenants`, { name: tenant });
    console.log(`🏢 Tenant created: ${tenant}`);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`🏢 Tenant exists: ${tenant}`);
    } else {
      console.error('❌ Tenant error:', err.response?.data || err.message);
    }
  }

  try {
    await axios.post(`${chromaBase}/tenants/${tenant}/databases`, { name: database });
    console.log(`💾 Database created: ${database}`);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`💾 Database exists: ${database}`);
    } else {
      console.error('❌ Database error:', err.response?.data || err.message);
    }
  }
  console.log('🔧 ensureTenantAndDatabase() finished.');
}

async function collectionExists() {
  console.log('🔍 Checking if collection exists...');
  const url = `${chromaBase}/tenants/${tenant}/databases/${database}/collections/${collectionName}`;
  try {
    const response = await axios.get(url);
    return response.status === 200;
  } catch {
    return false;
  }
}

async function createCollection() {
  console.log('📤 createCollection() starting...');
  const url = `${chromaBase}/tenants/${tenant}/databases/${database}/collections`;
  const payload = {
    name: collectionName,
    metadata: {
      created_by: "embed_chunks.js"
    }
  };

  console.log('🔗 Endpoint:', url);
  console.log('📦 Payload:', JSON.stringify(payload, null, 2));

  try {
    await axios.post(url, payload);
    console.log(`📁 Collection created: ${collectionName}`);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`📁 Collection already exists: ${collectionName}`);
    } else {
      console.error('❌ Collection error:', err.response?.data || err.message);
    }
  }
  console.log('📤 createCollection() finished.');
}

async function getCollectionId() {
  console.log('🔍 getCollectionId() starting...');
  const url = `${chromaBase}/tenants/${tenant}/databases/${database}/collections/${collectionName}`;
  try {
    const response = await axios.get(url);
    const collectionId = response.data.id;
    console.log(`🆔 Collection ID: ${collectionId}`);
    return collectionId;
  } catch (err) {
    console.error('❌ Failed to get collection ID:', err.response?.data || err.message);
    throw err;
  }
}

async function addToCollection(collectionId, id, embedding, document, metadata) {
  console.log(`📤 addToCollection() starting for ${id}...`);
  const url = `${chromaBase}/tenants/${tenant}/databases/${database}/collections/${collectionId}/add`;
  const payload = {
    ids: [id],
    documents: [document],
    metadatas: [metadata],
    embeddings: [embedding],
  };

  console.log('🔗 Endpoint:', url);
  console.log('📦 Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload);
    console.log(`✅ Added to collection: ${id}`);
  } catch (error) {
    console.error('❌ Add error:', error.response?.data || error.message);
  }
  console.log(`📤 addToCollection() finished for ${id}.`);
}

function chunkText(text, size, overlap) {
  console.log('✂️ chunkText() starting...');
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    start += size - overlap;
  }
  console.log(`✂️ chunkText() finished. Total chunks: ${chunks.length}`);
  return chunks;
}

async function embedText(text) {
  console.log('🧠 embedText() starting...');
  try {
    if (embeddingProvider === 'GIGACHAT') {
      const response = await axios.post(
        'https://gigachat.devices.sberbank.ru/api/v1/embeddings',
        { input: text, model: 'Embeddings' },
        {
          headers: {
            Authorization: `Bearer ${process.env.GIGACHAT_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Client-Id': 'posttman-request-collection',
            Accept: 'application/json',
          },
        }
      );

      console.log('🔍 GIGACHAT raw response:', JSON.stringify(response.data, null, 2));

      const embedding = response.data.data?.[0]?.embedding;

      if (!embedding || !Array.isArray(embedding)) {
        console.error('❌ embedText() error: Invalid embedding returned from GigaChat');
        throw new Error('Invalid embedding returned from GigaChat');
      }

      console.log('🧠 embedText() finished (GIGACHAT)');
      return embedding;
    }
 else if (embeddingProvider === 'OPENROUTER') {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/embeddings',
        {
          model: process.env.OPENROUTER_MODEL,
          input: text,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.OPENROUTER_REFERER,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('🧠 embedText() finished (OPENROUTER)');
      return response.data.data[0].embedding;
    } else {
      throw new Error('Unsupported embedding provider');
    }
  } catch (err) {
    if (err.response) {
      console.error('❌ embedText() error response:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('❌ embedText() error:', err.message);
    }
    throw err;
  }
}

async function embedAllChunks() {
  console.log('🚀 embedAllChunks() starting...');
  const records = JSON.parse(fs.readFileSync('parsed_chunks.json', 'utf-8'));
  const embedded = [];

  let collectionId = null;
  if (useChromaDB) {
    await ensureTenantAndDatabase();
    const exists = await collectionExists();
    if (!exists) {
      await createCollection();
    } else {
      console.log(`📁 Collection already exists: ${collectionName}`);
    }
    collectionId = await getCollectionId();
  }

  for (const [i, record] of records.entries()) {
    console.log(`📄 Processing record ${i + 1}/${records.length}: ${record.title}`);
    const chunks = chunkText(record.content, chunkSize, chunkOverlap);

    for (const [j, chunk] of chunks.entries()) {
      console.log(`🧩 Embedding chunk ${j + 1}/${chunks.length} of record ${i + 1}`);
      let embedding;
      try {
        embedding = await embedText(chunk);
      } catch {
        console.error(`❌ Failed to embed chunk ${j + 1} of record ${i + 1}`);
        continue;
      }

      const id = `doc-${i}-chunk-${j}`;

      if (useChromaDB) {
        await addToCollection(collectionId, id, embedding, chunk, {
          title: record.title,
          url: record.url,
        });
      } else {
        embedded.push({
          id,
          title: record.title,
          url: record.url,
          content: chunk,
          embedding,
        });
      }

      console.log(`✅ Embedded chunk ${j + 1}/${chunks.length} of record ${i + 1}`);
    }
  }

  if (!useChromaDB) {
    fs.writeFileSync('embedded_chunks.json', JSON.stringify(embedded, null, 2));
    console.log('📄 Saved to embedded_chunks.json');
  }

  console.log('🚀 embedAllChunks() finished.');
}

embedAllChunks().catch(err => {
  console.error('🔥 embedAllChunks() failed:', err.message);
});
