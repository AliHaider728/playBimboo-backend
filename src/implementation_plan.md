# MySQL Cutover Implementation Plan

This document outlines the step-by-step strategy for safely cutting over the live PlayBimboo production environment from MongoDB to the newly built MySQL infrastructure. Safety, zero data loss, and immediate rollback capabilities are the primary objectives.

## 1. Staging Test (Prerequisite)

Before any production changes occur, we will simulate the entire cutover in a staging environment.

1. **Staging Environment Setup**: We will deploy the backend to a staging server (or a secondary port) with all routes pointing to MySQL.
2. **End-to-End Manual Testing**: You will receive a staging link to manually test the site exactly as a customer and admin would:
   - Browsing products, filtering, searching
   - Adding to cart, completing checkout
   - Verifying TikTok/Meta CAPI events in the staging console
   - Managing products, orders, and categories in the admin panel
3. **Approval**: We only move to the production cutover steps once you officially sign off on the staging test.

---

## 2. Low-Traffic Cutover Window

- **Timing**: The cutover should be scheduled during your lowest historical traffic window (e.g., 3:00 AM - 5:00 AM PKT).
- **Maintenance Mode**: We recommend a brief 10-15 minute "Maintenance Mode" screen on the frontend during the final data sync to prevent customers from placing orders during the exact minute the databases are switching.
- **Database Backups**: Immediately before the cutover, we will run a full `mongodump` to snapshot the exact state of the MongoDB database.

---

## 3. The "Split Brain" Data Sync Strategy

If we cut over a route (e.g., Orders) to MySQL and need to roll back to MongoDB 3 hours later, MongoDB would be missing 3 hours of new orders. To handle this risk safely without building complex real-time dual-write logic:

1. **Delta-Sync Script**: Before cutover, we will write a `reverse-sync-mysql-to-mongo.ts` script.
2. **How it works**: If a rollback is initiated, this script will look at the exact cutover timestamp, query MySQL for any records created or modified *after* that time, and safely upsert them back into MongoDB. 
3. **Result**: You can roll back at any time without losing the data generated during the MySQL window.

---

## 4. Order of Cutover (Phased Rollout)

We will switch the routes in phases, starting with the lowest risk. After each phase, we monitor before proceeding to the next.

### Phase 1: Standalone & Low-Risk Routes
These routes have no relational dependencies and low write frequencies.
1. **Contact**
2. **Coupons**
3. **Settings**

### Phase 2: Structural & Read-Heavy Routes
These govern the store's display but do not handle transactional money/stock.
4. **GlobalAttributes**
5. **Categories**
6. **Reviews**

### Phase 3: Auth & Users
7. **Auth / Users**: High risk for user experience, but standalone from a database perspective. Ensures login/JWTs work perfectly before orders are touched.

### Phase 4: The Critical Core (Together)
8. **Products**
9. **Orders**
*Note: Products and Orders must be cut over together. The Orders route directly deducts stock from the Products table, and relies on Product variants. They cannot safely be split across two different databases simultaneously.*

---

## 5. Exact Rollback Procedure

All existing MongoDB models (`models/`) and routes (`routes/`) will remain **completely untouched and undeleted** in the codebase for at least 4-6 weeks. 

If an issue is detected in Phase X:
1. Identify the failing route (e.g., Orders).
2. Edit `server.ts` to swap one line:
   ```diff
   - app.use('/api/orders', mysqlOrderRoutes);
   + app.use('/api/orders', mongoOrderRoutes);
   ```
3. Restart the backend server (takes 5 seconds). Traffic is instantly back on MongoDB.
4. If MySQL received writes during the live window, run the `reverse-sync-mysql-to-mongo.ts` script to backfill the missing data to MongoDB.

---

## 6. Post-Cutover Monitoring

Immediately following Phase 4, we will closely monitor:
1. **Server Logs (`pm2 logs` or console)**: Watching for 500 HTTP errors, unhandled promise rejections, or CAPI request failures.
2. **Business Metrics**:
   - Order success rate (are orders dropping compared to the same hour yesterday?).
   - Successful JWT login rates.
3. **Data Integrity Checks**: We will run a post-cutover verification script an hour after launch to compare recent MySQL orders against MySQL product stock deductions to ensure they align perfectly.

## User Review Required
Please review this strategy. Let me know if you approve this plan, or if you'd like to adjust the staging process, sync strategy, or cutover order before we begin writing the Staging and Reverse-Sync scripts.
