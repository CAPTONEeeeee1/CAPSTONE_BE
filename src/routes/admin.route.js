const express = require("express");
const { auth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/admin");
const adminController = require("../controllers/admin.controller");

const router = express.Router();


router.get("/stats", auth(), requireAdmin, adminController.getStats);

router.get("/users", auth(), requireAdmin, adminController.getAllUsers);

router.get("/users/:userId", auth(), requireAdmin, adminController.getUserDetail);

router.put("/users/:userId/status", auth(), requireAdmin, adminController.updateUserStatus);

router.put("/users/:userId/role", auth(), requireAdmin, adminController.updateUserRole);

router.put("/users/:userId/info", auth(), requireAdmin, adminController.updateUserInfo);

router.delete("/users/:userId", auth(), requireAdmin, adminController.deleteUser);

router.get("/payments", auth(), requireAdmin, adminController.getPayments);

module.exports = router;
