export const DEFAULT_APP_NAME='Dr. Garden';
export function appDisplayName(session){const name=session?.installation?.name?.trim();return name&&name!=='Závlahový deník'?name:DEFAULT_APP_NAME;}
