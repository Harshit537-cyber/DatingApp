const express = require('express');
const userController = require('../controllers/user.controller');
const { validateUserRegistration } = require('../middleware/validate.middleware');

const router = express.Router();

router.route('/')
  .post(validateUserRegistration, userController.createUser)
  .get(userController.getUsers);

router.route('/:id')
  .get(userController.getUserById);

module.exports = router;