/**
 * Supabase가 돌려주는 영어 오류를 화면에 쓸 말로 옮긴다.
 *
 * 옮기지 못한 것은 원문 그대로 내보낸다. 감추는 것보다 낫다 —
 * 가입이 막혔을 때 무엇이 막았는지는 화면에 남아야 물어볼 수 있다.
 *
 * DB 트리거가 올리는 말(이름·초대코드)은 이미 우리말이라 그대로 지나간다.
 */
export function authMessage(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("already registered")) return "이미 가입된 이메일입니다. 로그인해주세요.";

  if (m.includes("invalid login")) return "이메일 또는 비밀번호가 맞지 않습니다.";

  if (m.includes("validate email") || m.includes("invalid email"))
    return "이메일 주소를 다시 확인해주세요.";

  if (m.includes("password should be") || m.includes("password is too short"))
    return "비밀번호는 8자 이상으로 정해주세요.";

  // 인증번호가 틀렸거나 시간이 지났다.
  // '만료'와 '틀림'만으로 거르면 메일 형식 오류까지 여기로 빨려 들어온다 — 번호 이야기인지까지 본다.
  // link 도 함께 본다. Supabase는 같은 상황을 "Email link is invalid or has expired" 로도 알려준다.
  if (
    (m.includes("expired") || m.includes("invalid")) &&
    (m.includes("token") || m.includes("otp") || m.includes("code") || m.includes("link"))
  )
    return "인증번호가 맞지 않거나 시간이 지났습니다. '인증번호 다시 보내기'를 눌러 새 번호를 받아주세요.";

  // 메일 자체가 나가지 못했다. 사람이 고칠 수 있는 문제가 아니므로 관리자에게 넘긴다.
  if (m.includes("sending confirmation") || m.includes("sending email") || m.includes("smtp"))
    return "인증번호 메일을 보내지 못했습니다. 잠시 뒤 다시 시도해보시고, 계속 안 되면 관리자에게 알려주세요. (메일 발송 설정 문제일 수 있습니다)";

  // 메일 발송만 막히는 것이 아니라 비밀번호 확인도 같은 제한에 걸린다 —
  // '메일을 너무 자주 보냈다'고 하면 메일을 보낸 적 없는 사람이 어리둥절해진다.
  if (m.includes("rate limit") || m.includes("for security purposes") || m.includes("too many"))
    return "너무 자주 시도했습니다. 1분쯤 뒤에 다시 해주세요.";

  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "지금은 가입 신청을 받지 않도록 되어 있습니다. 관리자에게 문의해주세요.";

  // 트리거가 올린 예외가 뭉뚱그려 돌아오는 경우
  if (m.includes("database error")) return "이름과 초대코드를 다시 확인해주세요.";

  return message;
}
