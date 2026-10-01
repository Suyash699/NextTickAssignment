import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const {
  findDeal,
  findBooking,
  findLeadByPhoneOrEmail,
  findContactByPhone,
} = require("../src/lib/zoho");

async function main() {
  console.log("Lead:", await findLeadByPhoneOrEmail("9876500001"));
  console.log("Deal:", await findDeal("9876500002"));
  console.log("Booking:", await findBooking("MAH-9921"));
  console.log("Contact:", await findContactByPhone("9876500004"));
}
main().catch(console.error);
