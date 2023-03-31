const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const https = require('https');
const { JSDOM } = require('jsdom')
const { Configuration, OpenAIApi } = require('openai');
const app = express();

dotenv.config();
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;
const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(config);

// Suggest Word
const suggest = async(message) => {
  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo-0301',
    messages: [
      {
        role: 'system',
        content: '以下はユーザからの質問である。回答を得るにはどういう単語で検索すべきか出力しなさい。最適な単語を「」で括って出力しなさい。'
      },
      {
        role: 'user',
        content: message
      }
    ]
  })
  const pattern = /「(.*?)」/g;
  const matches = response.data.choices[0].message.content.trim().match(pattern)?.map(match => match.slice(1, -1)).join(' ');
  return matches
}

// Investigate
const investigate = async(query) => {
  try{
    const googleRequest = await fetch(`https://www.google.com/search?q=${query}`, {headers:{'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0'}})
    const html = await googleRequest.text()
    const dom = new JSDOM(html, 'text/html')
    const doc = dom.window.document

    // class
    const className = {
      person: '.gyEfO',
      author: '.kp-header',
    }

    // 人名(大)
    //const authorInfo = Array.from(new Set([...doc.querySelector(className.author)?.querySelectorAll('span, a')]?.map(e => e.textContent)))

    // 人名(小)
    //const personInfo = doc.querySelector(className.person)?.textContent

    // 検索結果(サイト)
    const siteUrls = [...doc.querySelector('#search').querySelectorAll('.sATSHe, .kvH3mc, .BToiNc, .UK95Uc')].map(e => e.querySelector('.UK95Uc')?.querySelector('a').href).filter(
      f => f?.length > 0 && !f.startsWith('https://twitter.com') && !f.startsWith('https://www.youtube') && !f.startsWith('https://dic.pixiv') && !f.endsWith('.pdf')
    ).slice(0, 3)

    console.log('Pass:', siteUrls)

    // 要約させる
    const promisses = siteUrls.map((url) => {
      return fetch(url, {
        agent: httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0'
        }
      }).then(e => e.text()).then((html) => {
        const _dom = new JSDOM(html, 'text/html')
        const { document } = _dom.window
        const article = document.querySelector('main, article, #main, #article, #content, .main, .article, .content')
        if(!article) return null
        const content = [...article.querySelectorAll('p')]?.map(e => e.textContent).join('')
        if (content.trim().length <= 5) return null
        return openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0301',
          messages: [
            {
              role: 'system',
              content: '次に渡されるWeb記事から、重要であると考えられる情報を順番に5つ箇条書きで示せ。'
            },
            {
              role: 'user',
              content: content
            }
          ]
        })
      })
    })
    const results = await Promise.all(promisses);
    const list = results.map((r, index) => {
      if (!r || !r.hasOwnProperty('data')) return null
      return{
        'source': siteUrls[index],
        'info': r.data?.choices[0].message.content.split('\n')
      }
    }).filter(e => !!e)
    console.log(list)
    return list
  }catch(e){
    console.error(e)
  }
}

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/api/suggest', async(req, res) => {
  const result = await suggest(req.body.message)
  res.send(result)
})

app.post('/api/investigate', async(req, res) => {
  const result = await investigate(req.body.query)
  res.send(result)
})

app.post('/api/generate', async(req, res) => {
  const result = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo-0301',
    messages: req.body.messages
  })
  res.send(result.data.choices[0].message.content.trim())
})

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

