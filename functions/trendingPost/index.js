const functions = require('@google-cloud/functions-framework');
const { TwitterApi } = require('twitter-api-v2')
const { GoogleGenAI } = require('@google/genai')

const twitter = new TwitterApi({
  appKey: process.env.API_KEY,
  appSecret: process.env.API_SECRET,
  accessToken: process.env.ACCESS_TOKEN,
  accessSecret: process.env.ACCESS_SECRET,
})

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
})

/**
 * TODO: implement trending post
 */
functions.http('trendingPost', async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  const query = req.query
  const auth = query.auth

  if (auth !== process.env.AUTH) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  const resp = await fetch(`https://crypto.sunderlabs.com/api/pools`, {
    headers: {
      Authorization: `Bearer my-secret-token`,
    },
  })
  const data = await resp.json()
  const mostYield = data.pools[0]
  console.log('best pool', mostYield)
  //add rnd element to string to fetch new og image
  const rnd = Math.random()

  const url = `https://crypto.sunderlabs.com/social/${mostYield.address}?rnd=${rnd}`
  const yield = mostYield.yields['24h']['0.05'] * 100
  const name = mostYield.tokenA.symbol + '-' + mostYield.tokenB.symbol
  const volume = Number(mostYield.volume24h).toFixed(0)

  delete mostYield.yields['4h']

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    config: {
      temperature: 0.8,
      systemInstruction: [
        {
          text: `
You are the senior and export social media manager of sunderlabs. Generate a tweet / x post about the following orca liquidity pool.
Use formatting and wording to make it engaging, hook the reader.

Yield is per 24h. So terms like APY are not correct.
Post should be in the following formats, examples:

1.
Make ${yield.toFixed(2)}% estimated yield / 24h with the ${name} @orca_so liquidity pool.
It has a volume of $${volume.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.
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

You can make further variations on the examples given.

Keep it short and sweet, within the character limit of 280 characters.
But also bring variation into it from the example given. 
Make use of line breaks and empty lines to make it more readable.
**Always** include yield, name, and menion the url.
Include the url as {url} as this then gets replaced with the actual url.

**DO NOT** use markdown formatting as its not supported by twitter / x.

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
  //free tier: 17req / 24h
  const tweet = await twitter.v2.tweet(
    post,
  )

  res.status(200).json({
    success: true,
    message: 'Trending post generated and tweeted',
    post,
    tweetId: tweet.id,
    timestamp: new Date()
  })
});
