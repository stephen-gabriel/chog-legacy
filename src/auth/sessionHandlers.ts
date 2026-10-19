import type { AuthController } from './AuthContext';
import type { Handlers } from '@/ui/types';

export function sessionHandlers(
  auth: AuthController,
): Pick<Handlers, 'onConnect' | 'onSignIn' | 'onCancelSignIn' | 'onDisconnect' | 'onSwitchNetwork' | 'onPickWallet'> {
  return {
    onConnect: () => void auth.connect(),
    onSignIn: () => void auth.signIn(),
    onCancelSignIn: () => auth.cancelSignIn(),
    onDisconnect: () => void auth.disconnect(),
    onSwitchNetwork: () => void auth.switchNetwork(),
    onPickWallet: (uuid: string) => void auth.pickWallet(uuid),
  };
}
