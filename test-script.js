const http = require("http");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");

async function run() {
  const conn = await mysql.createConnection({host:"195.201.164.48",user:"tecnosphere_playbimboo",password:"Tecno!!@@2020",database:"tecnosphere_playbimboo"});
  
  const [[reviewRow]] = await conn.execute("SELECT productId FROM reviews WHERE status = \"approved\" LIMIT 1");
  const [[orderRow]] = await conn.execute("SELECT orderId FROM orders LIMIT 1");
  const [[productRow]] = await conn.execute("SELECT slug FROM products WHERE status = \"published\" LIMIT 1");
  const [[adminRow]] = await conn.execute("SELECT id, email FROM users WHERE role IN (\"admin\", \"super_admin\") LIMIT 1");
  await conn.end();

  const token = jwt.sign({ userId: adminRow.id, email: adminRow.email, role: "super_admin" }, "test_secret_123", { expiresIn: "1h" });
  const headers = { "Authorization": "Bearer " + token };

  const fetchJson = (path) => new Promise((resolve, reject) => {
    http.get("http://localhost:5013/api" + path, { headers }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on("error", reject);
  });

  console.log("--- 1. REVIEWS PUBLIC ---");
  if (reviewRow) {
    const reviews = await fetchJson("/reviews/product/" + reviewRow.productId);
    console.log(JSON.stringify(reviews[0], null, 2));
  } else { console.log("No approved reviews found in DB to test."); }

  console.log("\n--- 2a. ORDERS LIST ---");
  const ordersList = await fetchJson("/orders?limit=1");
  if(ordersList && ordersList.orders) console.log(JSON.stringify(ordersList.orders[0], null, 2));
  else console.log(JSON.stringify(ordersList[0], null, 2));

  console.log("\n--- 2b. ORDER DETAIL ---");
  if (orderRow) {
    const orderDetail = await fetchJson("/orders/" + orderRow.orderId);
    console.log(JSON.stringify(orderDetail, null, 2));
  }

  console.log("\n--- 3. PRODUCT DETAIL ---");
  if (productRow) {
    const productDetail = await fetchJson("/products/" + productRow.slug);
    console.log(JSON.stringify({
      id: productDetail.id,
      name: productDetail.name,
      description: productDetail.description ? "PRESENT (len: "+productDetail.description.length+")" : "MISSING",
      specifications: productDetail.specifications,
      features: productDetail.features,
      productDetailBlocks: productDetail.productDetailBlocks,
      metaTitle: productDetail.metaTitle,
      metaDescription: productDetail.metaDescription,
      safetyInfo: productDetail.safetyInfo
    }, null, 2));
  }

  console.log("\n--- 4. AUTH /ME ---");
  const me = await fetchJson("/auth/me");
  console.log(JSON.stringify(me, null, 2));

  console.log("\n--- 5a. COUPONS ---");
  const coupons = await fetchJson("/coupons");
  console.log(JSON.stringify(coupons[0] || [], null, 2));

  console.log("\n--- 5b. CONTACTS ---");
  const contacts = await fetchJson("/contact");
  console.log(JSON.stringify(contacts[0] || [], null, 2));

  console.log("\n--- 5c. GLOBAL ATTRIBUTES ---");
  const attrs = await fetchJson("/global-attributes");
  console.log(JSON.stringify(attrs[0] || [], null, 2));
}
run().catch(console.error);
