# z-art-sports-strava

## Intervals.icu Authentication

Use HTTP Basic authentication with your Intervals API key from `/settings`.

Request header format:

```http
Authorization: Basic <base64(API_KEY:YOUR_API_KEY)>
```

Environment variables:

- `INTERVALS_API_KEY`

Username is always `API_KEY`, password is your API key.
