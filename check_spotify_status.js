require("dotenv").config();

async function checkSpotify() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env");
    return;
  }

  console.log("1. Requesting App Token from Spotify Accounts service...");
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    console.error("Token generation failed:", tokenData);
    return;
  }

  console.log("Token received successfully (Client ID & Secret are valid).");

  console.log("\n2. Testing Spotify Web API Data Endpoint (api.spotify.com/v1/search)...");
  const apiRes = await fetch("https://api.spotify.com/v1/search?q=coldplay&type=track&limit=1", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  const bodyText = await apiRes.text();
  console.log(`HTTP Status: ${apiRes.status}`);
  console.log(`Spotify Response Body: ${bodyText}`);

  if (apiRes.status === 200) {
    console.log("\n SUCCESS: Spotify Web API is fully unlocked and ready to use!");
  } else if (apiRes.status === 403) {
    console.log("\n BLOCKED (403): App owner Spotify account requires an active Premium subscription.");
  }
}

checkSpotify().catch(console.error);
