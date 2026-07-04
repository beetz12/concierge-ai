export interface NormalizedMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  dateSent: string | null;
  direction: "inbound" | "outbound";
  status: string;
}
