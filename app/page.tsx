import Studio from "./studio-dashboard";
import { chatGPTSignInPath, chatGPTSignOutPath } from "./chatgpt-auth";

export default function Page() {
  return <Studio signIn={chatGPTSignInPath("/")} signOut={chatGPTSignOutPath()} />;
}
