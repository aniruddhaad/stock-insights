const bcrypt = require("bcrypt");
const { connectDatabase } = require("../config/database");
const User = require("../models/user.model");
const Stock = require("../models/stock.model");

async function seed() {
  await connectDatabase();

  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  const hashedPassword = await bcrypt.hash(password, 10);

  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      name: "Demo Investor",
      email,
      password: hashedPassword
    });
  }

  await Stock.deleteMany({ user: user._id });

  await Stock.insertMany([
    {
      user: user._id,
      symbol: "TCS",
      quantity: 12,
      buyPrice: 3650,
      buyDate: new Date("2024-02-12"),
      currentPrice: 4015,
      note: "Core IT holding"
    },
    {
      user: user._id,
      symbol: "INFY",
      quantity: 20,
      buyPrice: 1480,
      buyDate: new Date("2025-01-15"),
      currentPrice: 1624,
      note: "Accumulated on dip"
    },
    {
      user: user._id,
      symbol: "SBIN",
      quantity: 35,
      buyPrice: 720,
      buyDate: new Date("2025-06-08"),
      currentPrice: 807,
      note: "Financial exposure"
    }
  ]);

  console.log(
    JSON.stringify(
      {
        seeded: true,
        credentials: {
          email,
          password
        }
      },
      null,
      2
    )
  );

  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed", error);
  process.exit(1);
});
