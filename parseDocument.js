const fs = require('fs');
const cheerio = require('cheerio');

function parseHtmlToChunks(html) {
  const $ = cheerio.load(html);
  const chunks = [];

  $('h2').each((i, el) => {
    const titleRaw = $(el).text();
    const idMatch = titleRaw.match(/ID\s*=\s*"([^"]+)"/);
    const title = titleRaw.replace(/Внутренний ID\s*=.*$/, '').trim();
    const url = idMatch ? idMatch[1] : null;

    const contentParts = [];
    let next = $(el).next();
    while (next.length && next[0].tagName !== 'h2') {
      contentParts.push(next.text().trim());
      next = next.next();
    }

    chunks.push({
      title,
      url,
      content: contentParts.join('\n\n')
    });
  });

  return chunks;
}

// Example usage
const html = fs.readFileSync('salute_bot_log_payments.html.txt', 'utf-8');
const chunks = parseHtmlToChunks(html);
fs.writeFileSync('parsed_chunks.json', JSON.stringify(chunks, null, 2));
console.log('✅ Parsed and saved chunks.');
