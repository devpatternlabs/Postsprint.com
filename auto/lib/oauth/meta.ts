import {
  META_GRAPH_VERSION,
  META_GRAPH_BASE,
  META_REQUIRED_SCOPES,
  getMetaAuthUrl,
  exchangeMetaCodeForLongLivedToken,
  discoverUserFacebookPages,
  saveMetaConnection,
  getConnectedMetaAccount,
  getPersistedMetaAccounts,
  disconnectMeta,
} from "./meta-service";

export const META_SCOPES = META_REQUIRED_SCOPES.join(",");

export {
  META_GRAPH_VERSION,
  META_GRAPH_BASE,
  getMetaAuthUrl,
  exchangeMetaCodeForLongLivedToken,
  discoverUserFacebookPages,
  saveMetaConnection,
  getConnectedMetaAccount,
  getPersistedMetaAccounts,
  disconnectMeta,
};

export interface MetaOAuthResult {
  userId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramAccountId: string | null;
  instagramUsername: string | null;
  expiresIn?: number;
}

/**
 * Legacy compatibility wrapper that exchanges code and returns the primary Page.
 */
export async function exchangeMetaCode(code: string): Promise<MetaOAuthResult> {
  const { userAccessToken, expiresIn } = await exchangeMetaCodeForLongLivedToken(code);
  const pages = await discoverUserFacebookPages(userAccessToken);

  if (pages.length === 0) {
    throw new Error(
      "No Facebook Page found. You must create or manage a Facebook Page to publish videos."
    );
  }

  // Prioritize a page with an Instagram business account attached
  const selectedPage =
    pages.find((p) => p.instagramAccount?.id) || pages[0];

  return {
    userId: selectedPage.id,
    pageId: selectedPage.id,
    pageName: selectedPage.name,
    pageAccessToken: selectedPage.accessToken,
    instagramAccountId: selectedPage.instagramAccount?.id || null,
    instagramUsername: selectedPage.instagramAccount?.username || null,
    expiresIn,
  };
}
