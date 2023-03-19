// load env dotenv
require("dotenv").config();
const { Configuration, OpenAIApi } = require("openai");
// load spotify api
const SpotifyWebApi = require("spotify-web-api-node");
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});
// set refresh token
spotifyApi.setRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN);

// inject getQueue
var AuthenticationRequest = require("spotify-web-api-node/src/authentication-request"),
  WebApiRequest = require("spotify-web-api-node/src/webapi-request"),
  HttpManager = require("spotify-web-api-node/src/http-manager");

spotifyApi.getQueue = function (callback) {
  return WebApiRequest.builder(this.getAccessToken())
    .withPath("/v1/me/player/queue")
    .build()
    .execute(HttpManager.get, callback);
};

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const system = `https://spotify.com
https://reddit.com/r/ListenToThis`;
const prompt = `You are a music recommendation and DJ API bot. All responses should be in the same as this example JSON format:

\`\`\`json
{
"actions":["pause","play", "clearQueue"],
"toPlay":"Dynamite by Tao Cruz", // optional
"toQueue":["Megalovania by Toby Fox", "Hello by Adelle"]
}
\`\`\`
I want you to reply only with the JSON object and no other text. All song strings will be sent as a query to spotify.

`;

async function loadDJInstructions(text) {
  console.log(text);
  try {
    if (text == "play") {
      await spotifyApi.play();
      return {};
    }
    if (text == "pause") {
      await spotifyApi.pause();
      return {};
    }
  } catch (e) {}
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt + text },
    ],
  });

  return JSON.parse(completion.data.choices[0].message.content);
}

async function clearQueue() {
  console.log("clearing queue...");
  // pause
  try {
    await spotifyApi.pause();
  } catch (e) {}
  const { body: queue } = await spotifyApi.getQueue();
  const items = queue.queue;
  for (const item of items) {
    await spotifyApi.skipToNext();
  }
}

async function loadInstructionsToSpotify(instructions) {
  const { actions, toPlay, toQueue } = instructions;

  try {
    if (actions.includes("play")) await spotifyApi.play();
  } catch (e) {}
  try {
    if (actions.includes("pause")) await spotifyApi.pause();
  } catch (e) {}

  if (actions.includes("clearQueue")) await clearQueue();

  if (toPlay && toPlay.length > 0) {
    console.log(`searching song "${toPlay}"`);
    const { body } = await spotifyApi.searchTracks(toPlay);
    const track = body.tracks.items[0];
    console.log(
      `adding song "${track.name}" by ${track.artists[0].name} to queue`
    );
    await spotifyApi.addToQueue(track.uri);
    //play
    console.log("playing...");
    // play if paused
    const { body: playbackState } =
      await spotifyApi.getMyCurrentPlaybackState();
    if (playbackState.is_playing) {
      await spotifyApi.skipToNext();
    } else {
      await spotifyApi.play();
    }
  }

  if (actions.includes("pause")) {
    console.log("pausing...");
    await spotifyApi.pause();
  }

  if (toQueue && toQueue.length > 0) {
    console.log(`adding songs to queue`);
    // loop over toQueue and add
    for (const song of toQueue) {
      console.log(`searching song "${song}"`);
      const { body } = await spotifyApi.searchTracks(song);
      const track = body.tracks.items[0];
      console.log(
        `adding song "${track.name}" by ${track.artists[0].name} to queue`
      );
      await spotifyApi.addToQueue(track.uri);
    }
  }
  console.log("done!");
}

const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});
console.log("\033[2J");
function cli() {
  readline.question("dj> ", async (q) => {
    const data = await spotifyApi.refreshAccessToken();
    const accessToken = data.body["access_token"];
    spotifyApi.setAccessToken(accessToken);
    if (q == "exit") {
      process.exit();
    }
    if (q == "play") {
      await spotifyApi.play();
    } else if (q == "pause") {
      await spotifyApi.pause();
    } else {
      let inst = await loadDJInstructions(q);
      await loadInstructionsToSpotify(inst);
    }
    cli();
  });
}
cli();
