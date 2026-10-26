// crypto.randomUUID only exists in secure contexts; http://my-mac.local:8790 is not one.
export const MOCK_SESSION =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
