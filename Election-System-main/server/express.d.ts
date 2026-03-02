declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      email: string;
      name: string;
      password: string;
      emailVerified: boolean;
      emailVerificationToken: string | null;
      emailVerificationExpires: Date | null;
      passwordResetToken: string | null;
      passwordResetExpires: Date | null;
      role: string;
      isAdmin: boolean;
      isDisabled: boolean;
      candidateParty: string | null;
      candidateSymbol: string | null;
      candidatePartyManifesto: string | null;
      candidateManifesto: string | null;
      candidateApprovalStatus: string;
      deletedAt: Date | null;
      createdAt: Date | null;
    }
  }
}

export {};
