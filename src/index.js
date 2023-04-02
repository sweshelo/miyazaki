const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const https = require('https');
const fs = require('fs');
const { JSDOM } = require('jsdom')
const { Configuration, OpenAIApi } = require('openai');
const app = express();

dotenv.config();
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const logFilePath = 'log.json';
fs.writeFileSync(logFilePath, '');

const port = process.env.PORT || 3000;
const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(config);

// NGリスト - スクレイピングしても有用な情報を得られないページをリスト化している
const ngSitesList = [
  'https://twitter.com',
  'https://mobile.twitter.com',
  'https://www.youtube.com',
  'https://youtube.com',
  'https://dic.pixiv',
  'https://ototoy.jp',
  'https://mora.jp',
  'https://dic.nicovideo.jp/', // SSLのエラーが出る
]

// 「yyyymmdd」形式の日付文字列に変換する関数
function now() {

  const date = new Date();

  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

  const yyyy = y.toString();
  const mm = ("00" + m).slice(-2);
  const dd = ("00" + d).slice(-2);

  const h = date.getHours();
  const min = date.getMinutes();
  const s = date.getSeconds();

  const hh = ("00" + h).slice(-2);
  const mi = ("00" + min).slice(-2);
  const ss = ("00" + s).slice(-2);

  return yyyy + '/' + mm + '/' + dd + ' ' + hh + ':' + mi + ':' + ss;
}

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
  console.log(response.data.choices[0].message.content.trim())
  const matches = response.data.choices[0].message.content.trim().match(pattern)?.map(match => match.slice(1, -1)).join(' ');
  return matches
}

// Investigate
const investigate = async(query) => {
  try{
    const googleRequest = await fetch(
      `https://www.google.com/search?q=${query}`,
      {
        agent: httpsAgent,
        headers:{'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0'},
      }
    )
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
      f => f?.length > 0 && !f.endsWith('.pdf')
    )

    // NGリストを反映
    const filteredSiteUrls = siteUrls.filter((site) => ngSitesList.map(element => site.startsWith(element)).every(startsWithElement => !startsWithElement)).slice(0, 3)

    console.log('Pass:', filteredSiteUrls, siteUrls)
    console.log('次に渡されるWeb記事から、重要であると考えられる情報を順番に5つ箇条書きで示せ。' + (query ? `なお、ユーザは記事の検索にあたって『${query}』と検索している。` : ''))

    // 要約させる
    const promisses = filteredSiteUrls.map((url) => {
      return fetch(url, {
        agent: httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0'
        }
      }).then(e => e.text()).then((html) => {
        const _dom = new JSDOM(html, 'text/html')
        const { document } = _dom.window
        const article = document.querySelector('main, article, #main, #article, #content, #contents, .main, .article, .content, #cmsBody')
        if(!article){
          const regex = /^https?:\/\/([^/?#]+).*$/;
          const match = url.match(regex);
          if (match && match.length > 1) {
            ngSitesList.push(`https://${match[1]}`)
          }
          console.log(ngSitesList)
          return null
        }
        const content = [...article.querySelectorAll('p')]?.map(e => e.textContent).join('')
        if (content.trim().length <= 5) return null
        return openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0301',
          messages: [
            {
              role: 'system',
              content: '次に渡されるWeb記事から、重要であると考えられる情報を順番に5つ箇条書きで示せ。' + (query ? `なお、ユーザは記事の検索にあたって『${query}』と検索している。` : '')
            },
            {
              role: 'user',
              content: content.slice(0, 1500)
            }
          ]
        })
      })
    })
    const results = await Promise.all(promisses);
    const list = results.map((r, index) => {
      if (!r || !r.hasOwnProperty('data')) return null
      return{
        'source': filteredSiteUrls[index],
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

app.post('/api/question', async(req, res) => {
  try{
    const suggested = await suggest(req.body.question)
    const investigated = suggested ? await investigate(suggested) : []
    const generate = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo-0301',
      messages: [{
        role: 'user',
        content: `与えられた質問に、列挙された情報を元に回答しなさい。検索結果の内容についても言及し、関連性を分析しなさい。
- 現在日時: ${new Date()}
- 検索クエリ: ${suggested}
- 検索結果: ${investigated.map(e => e.source + e.info.join('\n')).join('\n')}
- 質問本文: ${req.body.question}
- 回答:
`
      }]
    })
    res.send(generate.data.choices[0].message.content.trim())

    // log
    const logData = {
      datetime: now(),
      address: req.ip,
      question: req.body.question,
      suggested,
      investigated,
      answer: generate.data.choices[0].message.content.trim()
    }
    fs.appendFileSync(logFilePath, JSON.stringify(logData) + '\n');
  }catch(e){
    console.error(e)
    res.send('申し訳ありません。内部エラーが発生しました。情報源のサイトにセキュリティ上の問題があるため、正常にページを読み込むことができませんでした。')
    fs.appendFileSync(logFilePath, JSON.stringify({
      datetime: now(),
      address: req.ip,
      question: req.body.question,
      suggested,
      investigated
    }) + '\n');
  }
})

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

