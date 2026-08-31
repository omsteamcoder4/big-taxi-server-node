import express from 'express';
import {
  createContact,
  getContacts,
  getContact,
  updateContact,
  deleteContact
} from '../controller/contactController.js';

const router = express.Router();

router.post('/', createContact);
router.get('/', getContacts);
router.get('/:id', getContact);
router.put('/:id', updateContact);
router.delete('/:id', deleteContact);

export default router;