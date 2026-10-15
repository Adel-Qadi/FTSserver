import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import config from "./config.js";
import {BadRequestError,UnauthorizedError,ForbiddenError,NotFoundError} from "./errors.js"
import { createUser, deleteAllUsers, getUserByEmail, updateUser, upgradeUserToChirpyRed} from "./db/queries/users.js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { createChirp, getChirps, getChirp, deleteChirp  } from "./db/queries/chirps";
import { hashPassword, checkPasswordHash, makeJWT, getBearerToken, validateJWT , makeRefreshToken, getAPIKey } from "./auth";
import { createRefreshToken, getUserFromRefreshToken, revokeRefreshToken} from "./db/queries/refreshTokens.js";

const migrationClient = postgres(config.db.url, { max: 1 });
migrate(drizzle(migrationClient), config.db.migrationConfig);


const app: Express = express();
const port = config.api.port;



app.use(middlewareLogResponses);

app.use("/app",middlewareMetricsInc);
app.use("/app",express.static("./src/app"));
app.use(express.json());

app.get('/api/healthz',(req: Request, res: Response) => {
    res.set({
        'Content-Type': 'text/plain',
    });
    res.send('OK');
});

app.get('/admin/metrics',(req: Request, res: Response) => {
    res.set({
        'Content-Type': 'text/html; charset=utf-8',
    })
    res.send(`<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.api.fileserverHits} times!</p>
  </body>
</html>`);
});

app.post("/admin/reset", async (req: Request, res: Response, next: NextFunction) => {
  if (config.api.platform !== "dev") {
    res.status(403).send("Forbidden");
    return;
  }

  try {
    await deleteAllUsers();
    config.api.fileserverHits = 0;
    res.status(200).send("count has been reset");
  } catch (error) {
    next(error);
  }
});

app.post("/api/chirps", async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    const userId = validateJWT(token, config.jwtSecret);
    const body = req.body.body;

    if (typeof body !== "string") {
      res.status(400).json({ error: "Chirp body must be a string" });
      return;
    }

    if (body.length > 140) {
      res.status(400).json({ error: "Chirp is too long. Max length is 140" });
      return;
    }

    const cleanedBody = body.trim();

    const chirp = await createChirp({
    body: cleanedBody,
    userId,
    });

    res.status(201).json({
      id: chirp.id,
      createdAt: chirp.createdAt,
      updatedAt: chirp.updatedAt,
      body: chirp.body,
      userId: chirp.userId,
    });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/chirps/:chirpId", async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    const userId = validateJWT(token, config.jwtSecret);

    const chirp = await getChirp(req.params.chirpId);

    if (!chirp) {
      res.status(404).json({ error: "Chirp not found" });
      return;
    }

    if (chirp.userId !== userId) {
      res.status(403).json({ error: "You are not the author of this chirp" });
      return;
    }

    await deleteChirp(chirp.id);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/*
app.get("/api/chirps", async (req, res, next) => {
  try {
    const chirps = await getChirps();

    res.status(200).json(
      chirps.map((chirp) => ({
        id: chirp.id,
        createdAt: chirp.createdAt,
        updatedAt: chirp.updatedAt,
        body: chirp.body,
        userId: chirp.userId,
      })),
    );
  } catch (err) {
    next(err);
  }
});
*/


app.get("/api/chirps", async (req, res, next) => {
  try {
    const authorId =
      typeof req.query.authorId === "string"
        ? req.query.authorId
        : undefined;

    const sort =
      req.query.sort === "desc" ? "desc" : "asc";

    const chirps = await getChirps(authorId);

    chirps.sort((a, b) => {
      if (sort === "asc") {
        return a.createdAt.getTime() - b.createdAt.getTime();
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    res.status(200).json(
      chirps.map((chirp) => ({
        id: chirp.id,
        createdAt: chirp.createdAt,
        updatedAt: chirp.updatedAt,
        body: chirp.body,
        userId: chirp.userId,
      })),
    );
  } catch (err) {
    next(err);
  }
});


app.get("/api/chirps/:chirpId", async (req, res, next) => {
  try {
    const chirp = await getChirp(req.params.chirpId);

    if (!chirp) {
      res.status(404).json({ error: "Chirp not found" });
      return;
    }

    res.status(200).json({
      id: chirp.id,
      createdAt: chirp.createdAt,
      updatedAt: chirp.updatedAt,
      body: chirp.body,
      userId: chirp.userId,
    });
  } catch (err) {
    next(err);
  }
});

/*
app.post('/api/validate_chirp', (req: Request, res: Response, next:NextFunction) => {
    let body = "";


  req.on("data",  (chunk) => {
    body += chunk;
  });

  req.on("end",  () => {
    try {
      const parsedBody = JSON.parse(body);

      if (parsedBody.body.length > 140){
        throw new BadRequestError("Chirp is too long. Max length is 140");
      }
      const splitBody = parsedBody.body.split(" ")
      for(let word in splitBody){
        if (splitBody[word].toLowerCase() === 'kerfuffle' || splitBody[word].toLowerCase() === 'sharbert' || splitBody[word].toLowerCase() === 'fornax'){
            splitBody[word] = "****";
        }
      }
      const respBody = splitBody.join(" ");

      const validResp = {
            "cleanedBody": respBody
        };
      res.status(200).send(JSON.stringify(validResp))
    } catch (error) {
        next(error);
    }
  });
}); 
*/
app.post("/api/users", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hashedPassword = await hashPassword(req.body.password);

    const user = await createUser({
      email: req.body.email,
      hashedPassword,
    });

    if (!user) {
      throw new Error("Failed to create user");
    }

    res.status(201).json({
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isChirpyRed: user.isChirpyRed,
        });
  } catch (error) {
    next(error);
  }
});
/*
app.post("/api/polka/webhooks", async (req, res, next) => {
  try {
    const { event, data } = req.body;

    // Ignore events we don't care about.
    if (event !== "user.upgraded") {
      res.status(204).end();
      return;
    }

    const user = await upgradeUserToChirpyRed(data.userId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
*/
app.post("/api/polka/webhooks", async (req, res, next) => {
  try {
    const apiKey = getAPIKey(req);

    if (apiKey !== config.api.polkaKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { event, data } = req.body;

    if (event !== "user.upgraded") {
      res.status(204).end();
      return;
    }

    const user = await upgradeUserToChirpyRed(data.userId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(204).end();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next(err);
  }
});

app.put("/api/users", async (req, res) => {
  try {
    const token = getBearerToken(req);
    const userId = validateJWT(token, config.jwtSecret);

    const hashedPassword = await hashPassword(req.body.password);

    const user = await updateUser(
      userId,
      req.body.email,
      hashedPassword,
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { hashedPassword: _, ...userResponse } = user;

    res.status(200).json(userResponse);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ error: err.message });
      return;
    }

    if (err instanceof Error &&
        (err.message === "Invalid JWT" ||
         err.message === "Missing or invalid Authorization header")) {
      res.status(401).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: "Something went wrong on our end" });
  }
});




/*
app.post("/api/login", async (req, res) => {
  try {
    const user = await getUserByEmail(req.body.email);

    if (!user) {
      res.status(401).json({ error: "incorrect email or password" });
      return;
    }

    const passwordMatches = await checkPasswordHash(
      req.body.password,
      user.hashedPassword,
    );

    if (!passwordMatches) {
      res.status(401).json({ error: "incorrect email or password" });
      return;
    }

    const expiresInSeconds = Math.min(
      req.body.expiresInSeconds ?? 3600,
      3600,
    );

    const token = makeJWT(
      user.id,
      expiresInSeconds,
      config.jwtSecret,
    );

    const { hashedPassword: _, ...userResponse } = user;

    res.status(200).json({
      ...userResponse,
      token,
    });
  } catch {
    res.status(401).json({ error: "incorrect email or password" });
  }
});
*/


app.post("/api/refresh", async (req, res) => {
  try {
    const token = getBearerToken(req);
    const user = await getUserFromRefreshToken(token);

    if (!user) {
      res.status(401).json({ error: "invalid refresh token" });
      return;
    }

    const accessToken = makeJWT(user.id, 3600, config.jwtSecret);

    res.status(200).json({ token: accessToken });
  } catch {
    res.status(401).json({ error: "invalid refresh token" });
  }
});


app.post("/api/revoke", async (req, res) => {
  try {
    const token = getBearerToken(req);
    await revokeRefreshToken(token);

    res.status(204).end();
  } catch {
    res.status(401).json({ error: "invalid refresh token" });
  }
});


app.post("/api/login", async (req, res) => {
  try {
    const user = await getUserByEmail(req.body.email);

    if (!user) {
      res.status(401).json({ error: "incorrect email or password" });
      return;
    }

    const passwordMatches = await checkPasswordHash(
      req.body.password,
      user.hashedPassword,
    );

    if (!passwordMatches) {
      res.status(401).json({ error: "incorrect email or password" });
      return;
    }

    const token = makeJWT(user.id, 3600, config.jwtSecret);
    const refreshToken = makeRefreshToken();

    await createRefreshToken(
      refreshToken,
      user.id,
      new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    );

    const { hashedPassword: _, ...userResponse } = user;

    res.status(200).json({
      ...userResponse,
      token,
      refreshToken,
    });
  } catch {
    res.status(401).json({ error: "incorrect email or password" });
  }
});


app.use(errorHandler);

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});

function middlewareLogResponses (req: Request, res: Response, next:NextFunction){
    res.on("finish",()=>{
        if(res.statusCode !=200){
            console.log(`[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`);
        }
    })
    next();
}

function middlewareMetricsInc(req: Request, res: Response, next: NextFunction) {
    config.api.fileserverHits++;
    next();
}

function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
    console.log(err);
    if(err instanceof BadRequestError || err instanceof UnauthorizedError || err instanceof ForbiddenError || err instanceof NotFoundError){
        res.status(err.statusCode).json({
            error: err.message
        })
    }else{
    res.status(500).json({
        error: "Something went wrong on our end",
    });
}
}

