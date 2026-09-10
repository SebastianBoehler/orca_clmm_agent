const { TwitterApi } = require('twitter-api-v2')
const { GoogleGenAI } = require('@google/genai')

const API_KEY = process.env.API_KEY
const API_SECRET = process.env.API_SECRET
const ACCESS_TOKEN = process.env.ACCESS_TOKEN
const ACCESS_SECRET = process.env.ACCESS_SECRET
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

const requiredEnv = {
  API_KEY,
  API_SECRET,
  ACCESS_TOKEN,
  ACCESS_SECRET,
  GEMINI_API_KEY,
}

for (const [name, value] of Object.entries(requiredEnv)) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
}

const twitter = new TwitterApi({
  appKey: API_KEY,
  appSecret: API_SECRET,
  accessToken: ACCESS_TOKEN,
  accessSecret: ACCESS_SECRET,
})

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
})

async function main() {
  const resp = await fetch(`https://crypto.sunderlabs.com/api/pools`)
  const data = await resp.json()
  const mostYield = data.pools[0]
  //console.log(mostYield)

  const url = `https://crypto.sunderlabs.com/social/${mostYield.address}`
  const yield = mostYield.yields['24h']['0.05'] * 100
  const name = mostYield.tokenA.symbol + '-' + mostYield.tokenB.symbol
  const volume = Number(mostYield.volume24h).toFixed(0)
  const text = `Make ${yield.toFixed(2)}% / 24h for liquidity providing in ${name} pool \nview at ${url}`

  delete mostYield.yields['4h']

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    config: {
      temperature: 0.7,
      systemInstruction: [
        {
          text: `
You are the senior and export social media manager of sunderlabs. Generate a tweet / x post about the following orca liquidity pool.
Use formatting and wording to make it engaging, hook the reader.

Yield is per 24h. So terms like APY are not correct.
Post should be in the following formats, examples:

1.
Make ${yield.toFixed(2)}% estimated yield / 24h with the ${name} @orca_so liquidity pool.
It has a volume of ${volume}.
Trade and view analytics at {url}

2.
${yield.toFixed(2)}% in 24h yield sounds too good? Check out the ${name} @orca_so liquidity pool.
Trade and view analytics at {url}

3.
${name} liq pool on @orca_so gives you ${yield.toFixed(2)}% yield / 24h.
Trade and view analytics at {url}

4.
${name} is the most yield pool with ${yield.toFixed(2)}% yield / 24h on @orca_so.
Trade and view analytics at {url}

Keep it short and sweet, within the character limit of 280 characters.
But also bring variation into it from the example given. 
Make use of line breaks and empty lines to make it more readable.
**Always** include yield, name, and menion the url.
Include the url as {url} as this then gets replaced with the actual url.

Only return one post, no additional text etc. Only the posts content
          `,
        },
      ],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `The most profitable pool is: \n ${JSON.stringify(mostYield)}`,
          },
        ],
      },
    ],
  })

  const raw = response.candidates[0].content.parts[0].text
  const post = raw.replace('{url}', url)
  console.log(post)
  return
  //free tier: 17req / 24h
  const tweet = await twitter.v2.tweet(
    post,
  )
}

main()
