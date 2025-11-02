export type TokenPartialUser = {
    id: string;
    isAnonymous: boolean;

    displayName: string | null;

    primaryEmail: string | null;
    primaryEmailVerified: boolean;
};
