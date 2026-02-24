declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      name: string;
      password: string;
      isAdmin: boolean;
      createdAt: Date | null;
    }
  }
}

export {};