import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { v2 as cloudinary } from 'cloudinary';

// Load environment variables
dotenv.config();

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME,

  api_key:
    process.env.CLOUDINARY_API_KEY,

  api_secret:
    process.env.CLOUDINARY_API_SECRET
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || 5000);
const WS_PORT = Number(process.env.WS_PORT || 8085);

const CLIENT_URL =
  process.env.CLIENT_URL || 'http://localhost:5173';

const JWT_SECRET =
  process.env.JWT_SECRET || 'dev-only-change-me';

// ===============================
// DATABASE
// ===============================

console.log("DB HOST:", process.env.DB_HOST);
console.log("DB PORT:", process.env.DB_PORT);
console.log("DB NAME:", process.env.DB_NAME);
console.log("DB USER:", process.env.DB_USER); 

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'unilia_ecommerce',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  ssl: {
    rejectUnauthorized: false
  }
});
// ===============================
// UPLOADS
// ===============================
// ===============================
// CLOUDINARY IMAGE UPLOADS
// ===============================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (_req, file, cb) => {
    cb(
      null,
      [
        'image/jpeg',
        'image/png',
        'image/webp'
      ].includes(file.mimetype)
    );
  }
});

function uploadImageToCloudinary(file) {
  return new Promise(
    (resolve, reject) => {
      const stream =
        cloudinary.uploader.upload_stream(
          {
            folder:
              'unilia-ecommerce',

            resource_type:
              'image'
          },

          (error, result) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(
              result.secure_url
            );
          }
        );

      stream.end(
        file.buffer
      );
    }
  );
}

function getCloudinaryPublicId(
  imageUrl
) {
  if (
    !imageUrl ||
    !imageUrl.includes(
      'res.cloudinary.com'
    )
  ) {
    return null;
  }

  try {
    const url =
      new URL(imageUrl);

    const parts =
      url.pathname
        .split('/')
        .filter(Boolean);

    const uploadIndex =
      parts.indexOf('upload');

    if (
      uploadIndex === -1
    ) {
      return null;
    }

    let publicParts =
      parts.slice(
        uploadIndex + 1
      );

    // Remove version, e.g. v1790192930
    if (
      publicParts[0] &&
      /^v\d+$/.test(
        publicParts[0]
      )
    ) {
      publicParts.shift();
    }

    if (!publicParts.length) {
      return null;
    }

    const filename =
      publicParts.pop();

    const filenameWithoutExtension =
      filename.replace(
        /\.[^/.]+$/,
        ''
      );

    return [
      ...publicParts,
      filenameWithoutExtension
    ].join('/');

  } catch {
    return null;
  }
}
// ===============================
// MIDDLEWARE
// ===============================

app.use(
  cors({
    origin: CLIENT_URL
  })
);

app.use(express.json());


// ===============================
// RESPONSE HELPERS
// ===============================

const ok = (res, data) =>
  res.json({
    success: true,
    ...data
  });

const fail = (
  res,
  status,
  message
) =>
  res.status(status).json({
    success: false,
    error: message
  });

// ===============================
// AUTHENTICATION
// ===============================

function auth(
  req,
  res,
  next
) {
  const header =
    req.headers.authorization || '';

  const token =
    header.startsWith('Bearer ')
      ? header.slice(7)
      : null;

  if (!token) {
    return fail(
      res,
      401,
      'Please log in to continue.'
    );
  }

  try {
    req.user =
      jwt.verify(
        token,
        JWT_SECRET
      );

    next();

  } catch {
    return fail(
      res,
      401,
      'Your session has expired. Please log in again.'
    );
  }
}

// ===============================
// HEALTH CHECK
// ===============================

app.get(
  '/api/health',
  (_req, res) => {
    ok(res, {
      message:
        'UNILIA E-Commerce backend is running.'
    });
  }
);

// ===============================
// REGISTER
// ===============================

app.post(
  '/api/auth/register',
  async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        location
      } = req.body;

      if (
        !name ||
        !email ||
        !password ||
        !location
      ) {
        return fail(
          res,
          400,
          'Name, email, password and location are required.'
        );
      }

      if (
        password.length < 6
      ) {
        return fail(
          res,
          400,
          'Password must be at least 6 characters.'
        );
      }

      const [
        existing
      ] =
        await pool.execute(
          'SELECT id FROM users WHERE email = ?',
          [
            email
              .trim()
              .toLowerCase()
          ]
        );

      if (
        existing.length
      ) {
        return fail(
          res,
          409,
          'That email is already registered.'
        );
      }

      const hash =
        await bcrypt.hash(
          password,
          12
        );

      const [
        result
      ] =
        await pool.execute(
          `INSERT INTO users
          (
            name,
            email,
            password_hash,
            location
          )
          VALUES (?, ?, ?, ?)`,
          [
            name.trim(),
            email
              .trim()
              .toLowerCase(),
            hash,
            location.trim()
          ]
        );

      const user = {
        id:
          result.insertId,

        name:
          name.trim(),

        email:
          email
            .trim()
            .toLowerCase(),

        location:
          location.trim()
      };

      const token =
        jwt.sign(
          user,
          JWT_SECRET,
          {
            expiresIn: '7d'
          }
        );

      ok(res, {
        user,
        token,
        message:
          'Account created successfully.'
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Registration failed. Please try again.'
      );
    }
  }
);

// ===============================
// LOGIN
// ===============================

app.post(
  '/api/auth/login',
  async (req, res) => {
    try {
      const {
        email,
        password
      } = req.body;

      if (
        !email ||
        !password
      ) {
        return fail(
          res,
          400,
          'Email and password are required.'
        );
      }

      const [
        rows
      ] =
        await pool.execute(
          `SELECT
            id,
            name,
            email,
            password_hash,
            location
           FROM users
           WHERE email = ?`,
          [
            email
              .trim()
              .toLowerCase()
          ]
        );

      if (
        !rows.length ||
        !(await bcrypt.compare(
          password,
          rows[0]
            .password_hash
        ))
      ) {
        return fail(
          res,
          401,
          'Incorrect email or password.'
        );
      }

      const {
        password_hash,
        ...user
      } = rows[0];

      const token =
        jwt.sign(
          user,
          JWT_SECRET,
          {
            expiresIn: '7d'
          }
        );

      ok(res, {
        user,
        token,
        message:
          'Welcome back.'
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Login failed.'
      );
    }
  }
);

// ===============================
// GET ALL LISTINGS
// ===============================

// ===============================
// GET ALL LISTINGS
// ===============================

app.get(
  '/api/listings',
  async (req, res) => {
    try {
      const q =
        String(
          req.query.q || ''
        ).trim();

      const params = [];

      let sql = `
        SELECT
          l.*,
          u.name AS seller_name,
          (
            SELECT COUNT(*)
            FROM listing_likes
            WHERE listing_id = l.id
          ) AS like_count
        FROM listings l
        JOIN users u
          ON u.id = l.seller_id
        WHERE 1=1
      `;

      if (q) {
        sql += `
          AND (
            l.name LIKE ?
            OR l.description LIKE ?
            OR l.location LIKE ?
          )
        `;

        const like =
          `%${q}%`;

        params.push(
          like,
          like,
          like
        );
      }

      sql += `
        ORDER BY l.created_at DESC
      `;

      const [
        rows
      ] =
        await pool.execute(
          sql,
          params
        );

      ok(res, {
        listings: rows
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not load goods.'
      );
    }
  }
);
// ===============================
// GET SINGLE LISTING
// ===============================

app.get(
  '/api/listings/:id',
  async (req, res) => {
    try {
      const [
        rows
      ] =
        await pool.execute(
          `SELECT
            l.*,
            u.name AS seller_name,
            u.email AS seller_email,
            u.location AS seller_location
           FROM listings l
           JOIN users u
             ON u.id = l.seller_id
           WHERE l.id = ?`,
          [
            req.params.id
          ]
        );

      if (!rows.length) {
        return fail(
          res,
          404,
          'Good not found.'
        );
      }

      ok(res, {
        listing:
          rows[0]
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not load the good.'
      );
    }
  }
);


// ===============================
// MY LISTINGS — SELLER DASHBOARD
// ===============================

app.get(
  '/api/my-listings',
  auth,
  async (req, res) => {
    try {
      const [
        rows
      ] =
        await pool.execute(
          `SELECT
            l.*,
            u.name AS seller_name,
            (
              SELECT COUNT(*)
              FROM listing_likes
              WHERE listing_id = l.id
            ) AS like_count
           FROM listings l
           JOIN users u
             ON u.id = l.seller_id
           WHERE l.seller_id = ?
           ORDER BY l.created_at DESC`,
          [
            req.user.id
          ]
        );

      ok(res, {
        listings: rows
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not load your listings.'
      );
    }
  }
);
// ===============================
// CREATE LISTING
// ===============================

app.post(
  '/api/listings',
  auth,
  upload.single('image'),
  async (req, res) => {
    try {
      const {
        name,
        price,
        description,
        location,
        order_cost
      } = req.body;

      if (!req.file) {
        return fail(
          res,
          400,
          'Please include a product image.'
        );
      }

      if (
        !name ||
        !price ||
        !description ||
        !location
      ) {
        return fail(
          res,
          400,
          'Name, cost, description and location are required.'
        );
      }

      const numericPrice =
        Number(price);

      const numericOrder =
        order_cost === '' ||
        order_cost == null
          ? null
          : Number(order_cost);

      if (
        !Number.isFinite(
          numericPrice
        ) ||
        numericPrice <= 0
      ) {
        return fail(
          res,
          400,
          'Product cost must be a valid amount greater than zero.'
        );
      }

      if (
        numericOrder !== null &&
        (
          !Number.isFinite(
            numericOrder
          ) ||
          numericOrder < 0
        )
      ) {
        return fail(
          res,
          400,
          'Order cost must be a valid non-negative amount.'
        );
      }

      const imageUrl =
  await uploadImageToCloudinary(
    req.file
  );
      const [
        result
      ] =
        await pool.execute(
          `INSERT INTO listings
          (
            seller_id,
            name,
            price,
            description,
            location,
            order_cost,
            image_url
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.id,
            name.trim(),
            numericPrice,
            description.trim(),
            location.trim(),
            numericOrder,
            imageUrl
          ]
        );

      const [
        rows
      ] =
        await pool.execute(
          `SELECT
            l.*,
            u.name AS seller_name
           FROM listings l
           JOIN users u
             ON u.id = l.seller_id
           WHERE l.id = ?`,
          [
            result.insertId
          ]
        );

      broadcast({
        type:
          'LISTING_CREATED',

        listing:
          rows[0]
      });

      ok(res, {
        listing:
          rows[0],

        message:
          'Good posted successfully.'
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not post the good.'
      );
    }
  }
);

// ===============================
// UPDATE LISTING — SELLER
// ===============================

app.patch(
  '/api/listings/:id',
  auth,
  upload.single('image'),
  async (req, res) => {
    try {
      const listingId =
        Number(req.params.id);

      const {
        name,
        price,
        description,
        location,
        order_cost
      } = req.body;

      if (!Number.isInteger(listingId)) {
        return fail(
          res,
          400,
          'Invalid product ID.'
        );
      }

      // Find the listing and verify ownership
      const [
        existingRows
      ] = await pool.execute(
        `SELECT *
         FROM listings
         WHERE id = ?`,
        [listingId]
      );

      if (!existingRows.length) {
        return fail(
          res,
          404,
          'Good not found.'
        );
      }

      const existing =
        existingRows[0];

      if (
        existing.seller_id !==
        req.user.id
      ) {
        return fail(
          res,
          403,
          'You can only edit your own goods.'
        );
      }

      if (
        !name ||
        !price ||
        !description ||
        !location
      ) {
        return fail(
          res,
          400,
          'Name, cost, description and location are required.'
        );
      }

      const numericPrice =
        Number(price);

      const numericOrder =
        order_cost === '' ||
        order_cost == null
          ? null
          : Number(order_cost);

      if (
        !Number.isFinite(
          numericPrice
        ) ||
        numericPrice <= 0
      ) {
        return fail(
          res,
          400,
          'Product cost must be a valid amount greater than zero.'
        );
      }

      if (
        numericOrder !== null &&
        (
          !Number.isFinite(
            numericOrder
          ) ||
          numericOrder < 0
        )
      ) {
        return fail(
          res,
          400,
          'Order cost must be a valid non-negative amount.'
        );
      }

      let imageUrl =
  existing.image_url;

if (req.file) {
  imageUrl =
    await uploadImageToCloudinary(
      req.file
    );
}
      await pool.execute(
        `UPDATE listings
         SET
           name = ?,
           price = ?,
           description = ?,
           location = ?,
           order_cost = ?,
           image_url = ?
         WHERE id = ?
           AND seller_id = ?`,
        [
          name.trim(),
          numericPrice,
          description.trim(),
          location.trim(),
          numericOrder,
          imageUrl,
          listingId,
          req.user.id
        ]
      );

      const [
        rows
      ] = await pool.execute(
        `SELECT
          l.*,
          u.name AS seller_name
         FROM listings l
         JOIN users u
           ON u.id = l.seller_id
         WHERE l.id = ?`,
        [listingId]
      );

      broadcast({
        type:
          'LISTING_UPDATED',

        listing:
          rows[0]
      });

      ok(res, {
        listing:
          rows[0],

        message:
          'Good updated successfully.'
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not update the good.'
      );
    }
  }
);


// ===============================
// LIKE / UNLIKE LISTING
// ===============================

app.post(
  '/api/listings/:id/like',
  auth,
  async (req, res) => {
    try {
      const listingId =
        Number(req.params.id);

      if (!Number.isInteger(listingId)) {
        return fail(
          res,
          400,
          'Invalid product ID.'
        );
      }

      const [
        listings
      ] = await pool.execute(
        `SELECT id
         FROM listings
         WHERE id = ?`,
        [listingId]
      );

      if (!listings.length) {
        return fail(
          res,
          404,
          'Good not found.'
        );
      }

      const [
        existing
      ] = await pool.execute(
        `SELECT id
         FROM listing_likes
         WHERE listing_id = ?
           AND user_id = ?`,
        [
          listingId,
          req.user.id
        ]
      );

      let liked;

      if (existing.length) {
        await pool.execute(
          `DELETE FROM listing_likes
           WHERE listing_id = ?
             AND user_id = ?`,
          [
            listingId,
            req.user.id
          ]
        );

        liked = false;
      } else {
        await pool.execute(
          `INSERT INTO listing_likes
           (
             listing_id,
             user_id
           )
           VALUES (?, ?)`,
          [
            listingId,
            req.user.id
          ]
        );

        liked = true;
      }

      const [
        countRows
      ] = await pool.execute(
        `SELECT COUNT(*) AS like_count
         FROM listing_likes
         WHERE listing_id = ?`,
        [listingId]
      );

      ok(res, {
        liked,
        like_count:
          Number(
            countRows[0]
              .like_count
          )
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not update like.'
      );
    }
  }
);


// ===============================
// GET MY LIKES
// ===============================

app.get(
  '/api/my-likes',
  auth,
  async (req, res) => {
    try {
      const [
        rows
      ] = await pool.execute(
        `SELECT listing_id
         FROM listing_likes
         WHERE user_id = ?`,
        [
          req.user.id
        ]
      );

      ok(res, {
        likes: rows.map(
          row => Number(
            row.listing_id
          )
        )
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not load your likes.'
      );
    }
  }
);

// ===============================
// BOOK LISTING
// ===============================


app.post(
  '/api/listings/:id/book',
  auth,
  async (req, res) => {
    const conn =
      await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [
        rows
      ] =
        await conn.execute(
          `SELECT *
           FROM listings
           WHERE id = ?
           FOR UPDATE`,
          [
            req.params.id
          ]
        );

      if (!rows.length) {
        await conn.rollback();

        return fail(
          res,
          404,
          'Good not found.'
        );
      }

      const listing =
        rows[0];

      if (
        listing.seller_id ===
        req.user.id
      ) {
        await conn.rollback();

        return fail(
          res,
          400,
          'You cannot book your own good.'
        );
      }

      if (
        listing.status !==
        'available'
      ) {
        await conn.rollback();

        return fail(
          res,
          409,
          'This good is no longer available.'
        );
      }

      const quantity =
        Math.max(
          1,
          Number(
            req.body.quantity || 1
          )
        );

      const [
        result
      ] =
        await conn.execute(
          `INSERT INTO bookings
          (
            listing_id,
            buyer_id,
            quantity,
            note
          )
          VALUES (?, ?, ?, ?)`,
          [
            listing.id,
            req.user.id,
            quantity,
            String(
              req.body.note || ''
            ).slice(0, 500)
          ]
        );

      await conn.execute(
        `UPDATE listings
         SET status = ?
         WHERE id = ?`,
        [
          'reserved',
          listing.id
        ]
      );

      await conn.commit();

      broadcast({
        type:
          'LISTING_STATUS',

        listingId:
          listing.id,

        status:
          'reserved'
      });

      ok(res, {
        bookingId:
          result.insertId,

        message:
          'Good booked. Contact the owner to arrange the handover.'
      });

    } catch (e) {
      await conn.rollback();

      console.error(e);

      fail(
        res,
        500,
        'Booking failed.'
      );

    } finally {
      conn.release();
    }
  }
);


// ===============================
// DELETE LISTING — SELLER
// ===============================

app.delete(
  '/api/listings/:id',
  auth,
  async (req, res) => {
    try {
      const listingId =
        Number(req.params.id);

      if (!Number.isInteger(listingId)) {
        return fail(
          res,
          400,
          'Invalid product ID.'
        );
      }

      // Find the product
      const [
        listings
      ] = await pool.execute(
        `SELECT
          id,
          seller_id,
          name,
          image_url
         FROM listings
         WHERE id = ?`,
        [listingId]
      );

      if (!listings.length) {
        return fail(
          res,
          404,
          'Good not found.'
        );
      }

      const listing =
        listings[0];

      // Only the owner can delete it
      if (
        Number(listing.seller_id) !==
        Number(req.user.id)
      ) {
        return fail(
          res,
          403,
          'You can only delete your own goods.'
        );
      }

      // Do not delete products that already have bookings
      const [
        bookings
      ] = await pool.execute(
        `SELECT COUNT(*) AS booking_count
         FROM bookings
         WHERE listing_id = ?`,
        [listingId]
      );

      const bookingCount =
        Number(
          bookings[0].booking_count
        );

      if (bookingCount > 0) {
        return fail(
          res,
          409,
          'This good cannot be deleted because it has booking records.'
        );
      }

      // Remove likes first
      await pool.execute(
        `DELETE FROM listing_likes
         WHERE listing_id = ?`,
        [listingId]
      );

      // Remove the product
      const [
        result
      ] = await pool.execute(
        `DELETE FROM listings
         WHERE id = ?
           AND seller_id = ?`,
        [
          listingId,
          req.user.id
        ]
      );

      if (!result.affectedRows) {
        return fail(
          res,
          404,
          'Good not found or you are not its owner.'
        );
      }

      // Remove the image from Cloudinary
      const publicId =
        getCloudinaryPublicId(
          listing.image_url
        );

      if (publicId) {
        try {
          await cloudinary.uploader.destroy(
            publicId,
            {
              resource_type:
                'image',
              type:
                'upload',
              invalidate:
                true
            }
          );
        } catch (imageError) {
          console.error(
            'Cloudinary image deletion failed:',
            imageError
          );
        }
      }

      broadcast({
        type:
          'LISTING_DELETED',

        listingId
      });

      ok(res, {
        message:
          'Good deleted successfully.'
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not delete the good.'
      );
    }
  }
);

// ===============================
// UPDATE LISTING STATUS
// ===============================

app.patch(
  '/api/listings/:id/status',
  auth,
  async (req, res) => {
    try {
      const status =
        [
          'available',
          'sold'
        ].includes(
          req.body.status
        )
          ? req.body.status
          : null;

      if (!status) {
        return fail(
          res,
          400,
          'Status must be available or sold.'
        );
      }

      const [
        result
      ] =
        await pool.execute(
          `UPDATE listings
           SET status = ?
           WHERE id = ?
           AND seller_id = ?`,
          [
            status,
            req.params.id,
            req.user.id
          ]
        );

      if (
        !result.affectedRows
      ) {
        return fail(
          res,
          404,
          'Good not found or you are not its owner.'
        );
      }

      broadcast({
        type:
          'LISTING_STATUS',

        listingId:
          Number(
            req.params.id
          ),

        status
      });

      ok(res, {
        message:
          `Good marked ${status}.`
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not update good status.'
      );
    }
  }
);

// ===============================
// BUYER BOOKINGS
// ===============================

app.get(
  '/api/bookings',
  auth,
  async (req, res) => {
    try {
      const [
        rows
      ] =
        await pool.execute(
          `SELECT
            b.*,
            l.name AS listing_name,
            l.price,
            l.image_url,
            l.status AS listing_status,
            u.name AS seller_name
           FROM bookings b
           JOIN listings l
             ON l.id = b.listing_id
           JOIN users u
             ON u.id = l.seller_id
           WHERE b.buyer_id = ?
           ORDER BY b.created_at DESC`,
          [
            req.user.id
          ]
        );

      ok(res, {
        bookings: rows
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not load bookings.'
      );
    }
  }
);

// ===============================
// SELLER RATINGS
// ===============================

// Submit a rating
app.post(
  '/api/ratings',
  auth,
  async (req, res) => {
    try {
      const {
        booking_id,
        rating,
        comment
      } = req.body;

      // Validate required fields
      if (
        !booking_id ||
        rating == null
      ) {
        return fail(
          res,
          400,
          'Booking ID and rating are required.'
        );
      }

      const numericRating =
        Number(rating);

      // Validate rating
      if (
        !Number.isInteger(
          numericRating
        ) ||
        numericRating < 1 ||
        numericRating > 5
      ) {
        return fail(
          res,
          400,
          'Rating must be a whole number between 1 and 5.'
        );
      }

      // Find booking
      const [
        bookings
      ] =
        await pool.execute(
          `SELECT
            b.id,
            b.buyer_id,
            b.listing_id,
            l.seller_id
           FROM bookings b
           JOIN listings l
             ON l.id = b.listing_id
           WHERE b.id = ?`,
          [
            booking_id
          ]
        );

      if (
        !bookings.length
      ) {
        return fail(
          res,
          404,
          'Booking not found.'
        );
      }

      const booking =
        bookings[0];

      // Check buyer
      if (
        Number(
          booking.buyer_id
        ) !==
        Number(
          req.user.id
        )
      ) {
        return fail(
          res,
          403,
          'You can only rate your own bookings.'
        );
      }

      // Check existing rating
      const [
        existing
      ] =
        await pool.execute(
          `SELECT id
           FROM ratings
           WHERE booking_id = ?`,
          [
            booking_id
          ]
        );

      if (
        existing.length
      ) {
        return fail(
          res,
          409,
          'You have already rated this booking.'
        );
      }

      // Save rating
      const [
        result
      ] =
        await pool.execute(
          `INSERT INTO ratings
          (
            booking_id,
            buyer_id,
            seller_id,
            listing_id,
            rating,
            comment
          )
          VALUES (?, ?, ?, ?, ?, ?)`,
          [
            booking.id,
            booking.buyer_id,
            booking.seller_id,
            booking.listing_id,
            numericRating,
            comment
              ? String(
                  comment
                )
                  .trim()
                  .slice(
                    0,
                    1000
                  )
              : null
          ]
        );

      ok(res, {
        rating_id:
          result.insertId,

        message:
          'Rating submitted successfully.'
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not submit rating.'
      );
    }
  }
);

// ===============================
// GET SELLER RATINGS
// ===============================

app.get(
  '/api/sellers/:sellerId/ratings',
  async (req, res) => {
    try {
      const sellerId =
        Number(
          req.params.sellerId
        );

      if (!sellerId) {
        return fail(
          res,
          400,
          'Invalid seller ID.'
        );
      }

      // Get reviews
      const [
        ratings
      ] =
        await pool.execute(
          `SELECT
            r.id,
            r.rating,
            r.comment,
            r.created_at,
            u.name AS buyer_name
           FROM ratings r
           JOIN users u
             ON u.id = r.buyer_id
           WHERE r.seller_id = ?
           ORDER BY r.created_at DESC`,
          [
            sellerId
          ]
        );

      // Get summary
      const [
        summary
      ] =
        await pool.execute(
          `SELECT
            COUNT(*) AS total_ratings,
            COALESCE(
              AVG(rating),
              0
            ) AS average_rating
           FROM ratings
           WHERE seller_id = ?`,
          [
            sellerId
          ]
        );

      ok(res, {
        ratings,

        summary: {
          total_ratings:
            Number(
              summary[0]
                .total_ratings
            ),

          average_rating:
            Number(
              Number(
                summary[0]
                  .average_rating
              ).toFixed(1)
            )
        }
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not load seller ratings.'
      );
    }
  }
);

// ===============================
// LOAD CHAT MESSAGES
// ===============================

app.get(
  '/api/messages/:userId',
  auth,
  async (req, res) => {
    try {
      const other =
        Number(
          req.params.userId
        );

      const [
        rows
      ] =
        await pool.execute(
          `SELECT
            m.*,
            s.name AS sender_name
           FROM messages m
           JOIN users s
             ON s.id = m.sender_id
           WHERE
             (
               m.sender_id = ?
               AND m.receiver_id = ?
             )
             OR
             (
               m.sender_id = ?
               AND m.receiver_id = ?
             )
           ORDER BY m.created_at ASC`,
          [
            req.user.id,
            other,
            other,
            req.user.id
          ]
        );

      ok(res, {
        messages: rows
      });

    } catch (e) {
      console.error(e);

      fail(
        res,
        500,
        'Could not load messages.'
      );
    }
  }
);

// ===============================
// START HTTP SERVER
// ===============================

app.listen(
  PORT,
  () => {
    console.log(
      `🚀 UNILIA HTTP API: http://localhost:${PORT}`
    );
  }
);

// ===============================
// WEBSOCKET SERVER
// ===============================

const wss =
  new WebSocketServer({
    port: WS_PORT
  });

const clients =
  new Map();

// ===============================
// BROADCAST
// ===============================

function broadcast(
  payload
) {
  const data =
    JSON.stringify(
      payload
    );

  for (
    const ws of clients.keys()
  ) {
    if (
      ws.readyState === 1
    ) {
      ws.send(data);
    }
  }
}

// ===============================
// SEND TO USER
// ===============================

function sendToUser(
  userId,
  payload
) {
  const data =
    JSON.stringify(
      payload
    );

  for (
    const [
      ws,
      id
    ] of clients
  ) {
    if (
      id === userId &&
      ws.readyState === 1
    ) {
      ws.send(data);
    }
  }
}

// ===============================
// WEBSOCKET CONNECTION
// ===============================

wss.on(
  'connection',
  (ws, req) => {
    try {
      const url =
        new URL(
          req.url,
          `http://localhost:${WS_PORT}`
        );

      const token =
        url.searchParams.get(
          'token'
        );

      const user =
        jwt.verify(
          token,
          JWT_SECRET
        );

      clients.set(
        ws,
        Number(user.id)
      );

      ws.send(
        JSON.stringify({
          type:
            'CONNECTED',

          message:
            'Real-time chat connected.'
        })
      );

      // ===============================
      // RECEIVE CHAT MESSAGE
      // ===============================

      ws.on(
        'message',
        async raw => {
          try {
            const data =
              JSON.parse(
                raw.toString()
              );

            if (
              data.type !==
              'CHAT_MESSAGE'
            ) {
              return;
            }

            const receiverId =
              Number(
                data.receiverId
              );

            const listingId =
              data.listingId
                ? Number(
                    data.listingId
                  )
                : null;

            const body =
              String(
                data.body || ''
              ).trim();

            if (
              !receiverId ||
              !body
            ) {
              return ws.send(
                JSON.stringify({
                  type:
                    'ERROR',

                  message:
                    'Message cannot be empty.'
                })
              );
            }

            const [
              result
            ] =
              await pool.execute(
                `INSERT INTO messages
                (
                  sender_id,
                  receiver_id,
                  listing_id,
                  body
                )
                VALUES (?, ?, ?, ?)`,
                [
                  user.id,
                  receiverId,
                  listingId,
                  body.slice(
                    0,
                    2000
                  )
                ]
              );

            const message = {
              id:
                result.insertId,

              sender_id:
                user.id,

              receiver_id:
                receiverId,

              listing_id:
                listingId,

              body:
                body.slice(
                  0,
                  2000
                ),

              sender_name:
                user.name,

              created_at:
                new Date()
                  .toISOString()
            };

            // Send to receiver
            sendToUser(
              receiverId,
              {
                type:
                  'CHAT_MESSAGE',

                message
              }
            );

            // Send back to sender
            ws.send(
              JSON.stringify({
                type:
                  'CHAT_MESSAGE',

                message
              })
            );

          } catch (e) {
            console.error(
              'WS error',
              e
            );

            ws.send(
              JSON.stringify({
                type:
                  'ERROR',

                message:
                  'Message could not be sent.'
              })
            );
          }
        }
      );

      // ===============================
      // DISCONNECT
      // ===============================

      ws.on(
        'close',
        () => {
          clients.delete(
            ws
          );
        }
      );

    } catch {
      ws.close(
        1008,
        'Authentication required'
      );
    }
  }
);

// ===============================
// WEBSOCKET START MESSAGE
// ===============================

console.log(
  `💬 UNILIA WebSocket: ws://localhost:${WS_PORT}`
);
