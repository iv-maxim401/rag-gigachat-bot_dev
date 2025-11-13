require('dotenv').config();
const axios = require('axios');

// Disable TLS certificate validation (for dev only)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const embeddingProvider = process.env.EMBEDDING_PROVIDER;
const chromaBase = process.env.CHROMA_URL || 'http://localhost:8000/api/v2';
const tenant = process.env.CHROMA_TENANT || 'default-tenant';
const database = process.env.CHROMA_DATABASE || 'default-db';
const collectionName = process.env.CHROMA_COLLECTION || 'gigachat_embeddings';

async function embedPrompt(prompt) {
  console.log('🧠 embedPrompt() starting...');
  try {
    if (embeddingProvider === 'GIGACHAT') {
      const response = await axios.post(
        'https://gigachat.devices.sberbank.ru/api/v1/embeddings',
        { input: prompt, model: 'Embeddings' },
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
        throw new Error('Invalid embedding returned from GigaChat');
      }

      console.log('🧠 embedPrompt() finished (GIGACHAT)');
      return embedding;
    } else if (embeddingProvider === 'OPENROUTER') {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/embeddings',
        {
          model: process.env.OPENROUTER_MODEL,
          input: prompt,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.OPENROUTER_REFERER,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('🧠 embedPrompt() finished (OPENROUTER)');
      return response.data.data[0].embedding;
    } else {
      throw new Error('Unsupported embedding provider');
    }
  } catch (err) {
    console.error('❌ embedPrompt() error:', err.response?.data || err.message);
    throw err;
  }
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

async function queryCollection(collectionId, embedding) {
  console.log('🔍 queryCollection() starting...');
  const url = `${chromaBase}/tenants/${tenant}/databases/${database}/collections/${collectionId}/query`;
  const payload = {
    query_embeddings: [embedding],
    n_results: embeddingProvider === 'GIGACHAT' ? 3 : 5,
  };

  console.log('🔗 Endpoint:', url);
  console.log('📦 Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload);
    console.log('🔍 queryCollection() finished.');
    return response.data;
  } catch (err) {
    console.error('❌ queryCollection() error:', err.response?.data || err.message);
    throw err;
  }
}

function buildContext(results) {
  console.log('🧩 buildContext() starting...');
  const chunks = results.documents[0];
  const metadatas = results.metadatas[0];

  let context = '';
  for (let i = 0; i < chunks.length; i++) {
    const meta = metadatas[i];
    const chunkText = `### ${meta.title}\n${chunks[i]}`; // remove URL to save tokens

    if (embeddingProvider === 'GIGACHAT') {
      if ((context + chunkText).length > 1500) { // tighter limit
        console.warn('⚠️ Context truncated to fit GIGACHAT token limit.');
        break;
      }
    }

    context += chunkText + '\n\n---\n\n';
  }

  console.log('🧩 buildContext() finished.');
  return context;
}




function buildFinalPrompt(userPrompt, context) {
  return `Вот информация, найденная по вашему запросу:\n\n${context}\n\n---\n\nВопрос: ${userPrompt}\nОтвет:`;
}

async function generateAnswer(prompt) {
  console.log('🧠 generateAnswer() starting...');
  try {
    if (embeddingProvider === 'GIGACHAT') {
      const response = await axios.post(
        'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
        {
          model: 'GigaChat', // or use the correct model name if different
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        },
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

      return response.data.choices[0].message.content;

    }
 else if (embeddingProvider === 'OPENROUTER') {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.OPENROUTER_REFERER,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('🧠 generateAnswer() finished (OPENROUTER)');
      return response.data.choices[0].message.content;
    } else {
      throw new Error('Unsupported chat provider');
    }
  } catch (err) {
    console.error('❌ generateAnswer() error:', err.response?.data || err.message);
    throw err;
  }
}


async function answerPrompt(userPrompt) {
  console.log('🚀 answerPrompt() starting...');
  const embedding = await embedPrompt(userPrompt);

  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('❌ No valid embedding generated for the prompt');
  }


  const collectionId = await getCollectionId();
  const results = await queryCollection(collectionId, embedding);
  const context = buildContext(results);
  const finalPrompt = buildFinalPrompt(userPrompt, context);
  const answer = await generateAnswer(finalPrompt);

  console.log('\n🧠 RAG Answer:\n');
  console.log(answer);

  console.log('\n📚 Источники, использованные для ответа:\n');
  const chunks = results.documents[0];
  const metadatas = results.metadatas[0];
  const distances = results.distances[0];

  metadatas.forEach((meta, i) => {
    const similarity = (1 - distances[i]).toFixed(4); // Convert distance to similarity
    console.log(`🔹 ${i + 1}. ${meta.title}`);
    console.log(`   🔗 ${meta.url}`);
    console.log(`   📊 Сходство: ${similarity}`);
    console.log(`   📄 Фрагмент:\n${chunks[i].slice(0, 500)}\n`);
  });

  console.log('🚀 answerPrompt() finished.');
}



const userPrompt = process.argv.slice(2).join(' ');
if (!userPrompt) {
  console.error('❌ Please provide a prompt as a command-line argument.');
  process.exit(1);
}

answerPrompt(userPrompt).catch(err => {
  console.error('🔥 answerPrompt() failed:', err.message);
});
