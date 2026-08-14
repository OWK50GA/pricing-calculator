import { Router } from "express";
import {
  addLineItem,
  batchAddLineItems,
  createDocumentDraft,
  deleteDocumentDraft,
  deleteLineItem,
  editDraftDocumentMeta,
  editLineItem,
  finalizeDocument,
  getUserDocument,
  listUserDocuments,
} from "../controllers/document.controller.js";

const router = Router();

router.post("/", createDocumentDraft);

router.get("/", listUserDocuments);

router.get("/:id", getUserDocument);

router.patch("/:id", editDraftDocumentMeta);

router.delete("/:id", deleteDocumentDraft);

router.post("/:id/finalize", finalizeDocument);

router.post("/:id/line-items", addLineItem);

router.post("/:id/line-items/batch", batchAddLineItems);

router.patch("/:id/line-items/:lineId", editLineItem);

router.delete("/:id/line-items/:lineId", deleteLineItem);

export default router;
