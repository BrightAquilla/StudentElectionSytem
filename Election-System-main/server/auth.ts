import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User } from "@shared/schema";
import { api } from "@shared/routes";
import { z } from "zod";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "r8q,+&1LM3)CD*zAGpx1xm{NeQhc;#",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use((req, res, next) => {
    if (req.isAuthenticated() && (req.user?.isDisabled || req.user?.deletedAt)) {
      req.logout(() => {
        res.status(403).json({ message: "Account is disabled. Contact an administrator." });
      });
      return;
    }
    next();
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || user.isDisabled || user.deletedAt) {
        return done(null, false, { message: "Account is disabled. Contact an administrator." });
      }
      if (!(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const input = api.auth.register.input.parse({
        ...req.body,
        username: String(req.body.username || "").toUpperCase(),
      });
      const existingUser = await storage.getUserByUsername(input.username);
      if (existingUser) {
        return res.status(409).json({ message: "Registration number already exists" });
      }
      const existingEmail = await storage.getUserByEmail(input.email);
      if (existingEmail) {
        return res.status(409).json({ message: "Email already exists" });
      }

      const hashedPassword = await hashPassword(input.password);
      await storage.createUser({
        ...input,
        password: hashedPassword,
        role: "voter",
      });
      res.status(201).json({ message: "Account created successfully." });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, details: err.errors });
      }
      next(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: User | false, info?: { message?: string }) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid username or password" });
      }

      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        return res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).send("Not logged in");
    }
  });

  app.patch("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const schema = z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
    });

    try {
      const input = schema.parse(req.body);
      if (!input.name && !input.email && !input.password) {
        return res.status(400).json({ message: "No profile changes submitted" });
      }

      if (input.email && input.email !== req.user!.email) {
        const existingEmail = await storage.getUserByEmail(input.email);
        if (existingEmail && existingEmail.id !== req.user!.id) {
          return res.status(409).json({ message: "Email already exists" });
        }
      }

      let updated = req.user!;
      if (input.name || input.email) {
        const profileUpdated = await storage.updateUser(req.user!.id, {
          ...(input.name ? { name: input.name } : {}),
          ...(input.email ? { email: input.email } : {}),
        });
        if (!profileUpdated) {
          return res.status(404).json({ message: "User not found" });
        }
        updated = profileUpdated;
      }

      if (input.password) {
        const hashedPassword = await hashPassword(input.password);
        const passwordUpdated = await storage.updateUserPassword(req.user!.id, hashedPassword);
        if (!passwordUpdated) {
          return res.status(404).json({ message: "User not found" });
        }
        updated = passwordUpdated;
      }

      return res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, details: err.errors });
      }
      return res.status(500).json({ message: "Failed to update profile" });
    }
  });
}

// Helper for seeding
export async function createAdminUser() {
    const existingAdmin = await storage.getUserByUsername("admin");
    if (!existingAdmin) {
        const hashedPassword = await hashPassword("admin123");
        await storage.createUser({
            username: "admin",
            email: "admin@pwani.local",
            password: hashedPassword,
            name: "System Admin",
            role: "admin",
            isAdmin: true
        });
        console.log("Admin user created: admin / admin123");
    }
}
