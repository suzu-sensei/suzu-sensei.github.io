const developmentRef = 'cjypnhxouqxvwwctzojs';
const productionRef = 'ploropobmgwlpphtkndo';

export type DeployEnvironment = 'development' | 'production';

export type PublicEnvironment = {
  deployEnvironment: DeployEnvironment;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

type EnvironmentSource = {
  VITE_DEPLOY_ENV?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

export function readEnvironment(source: EnvironmentSource = import.meta.env as unknown as EnvironmentSource): PublicEnvironment {
  const deployEnvironment = (source.VITE_DEPLOY_ENV?.trim() || 'development') as DeployEnvironment;
  const supabaseUrl = source.VITE_SUPABASE_URL?.trim() ?? '';
  const supabasePublishableKey = source.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  if (deployEnvironment !== 'development' && deployEnvironment !== 'production') {
    throw new Error('VITE_DEPLOY_ENVはdevelopmentまたはproductionを指定してください。');
  }
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Supabaseの公開設定がありません。環境設定を確認してください。');
  }
  const expectedRef = deployEnvironment === 'production' ? productionRef : developmentRef;
  if (!supabaseUrl.includes(expectedRef)) {
    throw new Error(`${deployEnvironment}用に承認されたSupabase projectとURLが一致しません。`);
  }
  return { deployEnvironment, supabaseUrl, supabasePublishableKey };
}
