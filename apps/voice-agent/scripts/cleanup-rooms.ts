import { RoomServiceClient } from "livekit-server-sdk";

const LIVEKIT_URL = process.env.LIVEKIT_URL
  ? process.env.LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://")
  : "https://concierge-ai-tc9rdwb6.livekit.cloud";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "APImZeU8dgLBSfP";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "5HCM3UeaumdnatHeyI4S9Ed2YDu9ZY3YoGMGc7MWJQp";

const client = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

async function cleanup() {
  console.log("Listing active LiveKit rooms...");
  const rooms = await client.listRooms();

  if (rooms.length === 0) {
    console.log("No active rooms found. Worker capacity is clear.");
    return;
  }

  console.log(`Found ${rooms.length} active room(s):`);
  for (const room of rooms) {
    const created = new Date(Number(room.creationTime) * 1000).toISOString();
    console.log(`  - ${room.name} (participants: ${room.numParticipants}, created: ${created})`);
  }

  console.log("\nDeleting all rooms to free worker capacity...");
  for (const room of rooms) {
    try {
      await client.deleteRoom(room.name);
      console.log(`  ✓ Deleted: ${room.name}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ⚠ Could not delete ${room.name}: ${msg}`);
    }
  }

  const remaining = await client.listRooms();
  console.log(`\nDone. Remaining active rooms: ${remaining.length}`);
}

cleanup().catch(console.error);
