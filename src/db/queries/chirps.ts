import { db } from "../index";
import { chirps, type NewChirp } from "../schema";
import { asc, eq  } from "drizzle-orm";


export async function createChirp(chirp: NewChirp) {
  const [result] = await db.insert(chirps).values(chirp).returning();
  return result;
}

/*
export async function getChirps() {
  return db.select().from(chirps).orderBy(asc(chirps.createdAt));
}*/

export async function getChirps(authorId?: string) {
  if (authorId) {
    return await db
      .select()
      .from(chirps)
      .where(eq(chirps.userId, authorId));
  }

  return await db.select().from(chirps);
}


export async function getChirp(id: string) {
  const [chirp] = await db.select().from(chirps).where(eq(chirps.id, id));
  return chirp;
}

export async function deleteChirp(chirpId: string) {
  const [chirp] = await db
    .delete(chirps)
    .where(eq(chirps.id, chirpId))
    .returning();

  return chirp;
}