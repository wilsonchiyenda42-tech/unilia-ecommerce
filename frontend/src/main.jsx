import React, {
  createContext,
  useContext,
  useEffect,
  useState
} from 'react';

import {
  createRoot
} from 'react-dom/client';

import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams
} from 'react-router-dom';

import './styles.css';


const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:5000';

const WS =
  import.meta.env.VITE_WS_URL ||
  'ws://localhost:8085';

  function getImageUrl(imageUrl) {
  if (!imageUrl) {
    return '';
  }

  if (
    imageUrl.startsWith('http://') ||
    imageUrl.startsWith('https://')
  ) {
    return imageUrl;
  }

  return `${API}${imageUrl}`;
}

// ========================================
// AUTH CONTEXT
// ========================================

const AuthContext =
  createContext(null);

function AuthProvider({ children }) {
  const [auth, setAuth] =
    useState(() => {
      try {
        return (
          JSON.parse(
            localStorage.getItem(
              'unilia_auth'
            )
          ) || null
        );
      } catch {
        return null;
      }
    });

  const login = data => {
    localStorage.setItem(
      'unilia_auth',
      JSON.stringify(data)
    );

    setAuth(data);
  };

  const logout = () => {
    localStorage.removeItem(
      'unilia_auth'
    );

    setAuth(null);
  };

  return (
    <AuthContext.Provider
      value={{
        auth,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(
    AuthContext
  );
}

// ========================================
// API HELPER
// ========================================

async function api(
  path,
  options = {}
) {
  const auth =
    JSON.parse(
      localStorage.getItem(
        'unilia_auth'
      ) || 'null'
    );

  const headers = {
    ...(options.headers || {})
  };

  if (auth?.token) {
    headers.Authorization =
      `Bearer ${auth.token}`;
  }

  const res =
    await fetch(
      `${API}${path}`,
      {
        ...options,
        headers
      }
    );

  let data = {};

  try {
    data =
      await res.json();
  } catch {}

  if (
    !res.ok ||
    data.success === false
  ) {
    throw new Error(
      data.error ||
      'Something went wrong.'
    );
  }

  return data;
}

// ========================================
// LOGO
// ========================================

function Logo() {
  return (
    <Link
      className="brand"
      to="/"
    >
      <img
        className="brand-logo"
        src="https://gsgs.network/app/uploads/2025/06/University-of-Livingstonia250.png"
        alt="UNILIA E-Commerce"
      />

      <span>
        UNILIA <b>E-Commerce</b>
      </span>
    </Link>
  );
}

// ========================================
// HEADER
// ========================================

function Header() {
  const {
    auth,
    logout
  } = useAuth();

  return (
    <header>
      <Logo />

      <nav>
        <Link to="/">
          Marketplace
        </Link>

        {auth && (
          <>
            <Link to="/dashboard">
              Dashboard
            </Link>

            <Link to="/post">
              Post Good
            </Link>

            <Link to="/bookings">
              Bookings
            </Link>

            <Link to="/chat">
              Chat
            </Link>
          </>
        )}

        {auth ? (
          <button
            className="link-btn"
            onClick={logout}
          >
            Logout
          </button>
        ) : (
          <>
            <Link to="/login">
              Login
            </Link>

            <Link
              className="nav-cta"
              to="/register"
            >
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

// ========================================
// LAYOUT
// ========================================

function Layout({
  children
}) {
  return (
    <>
      <Header />

      <main>
        {children}
      </main>

      <footer>
        © {new Date().getFullYear()}
        {' '}
        UNILIA E-Commerce ·
        Student marketplace
      </footer>
    </>
  );
}

// ========================================
// PROTECTED ROUTE
// ========================================

function Protected({
  children
}) {
  const { auth } =
    useAuth();

  return auth
    ? children
    : (
      <Navigate
        to="/login"
        replace
      />
    );
}

// ========================================
// NOTICE
// ========================================

function Notice({
  error,
  success
}) {
  if (error) {
    return (
      <div className="notice error">
        ⚠ {error}
      </div>
    );
  }

  if (success) {
    return (
      <div className="notice success">
        ✓ {success}
      </div>
    );
  }

  return null;
}

// ========================================
// MARKETPLACE
// ========================================

function Marketplace() {
  const {
    auth
  } = useAuth();

  const [items, setItems] =
    useState([]);

  const [q, setQ] =
    useState('');

  const [likedIds, setLikedIds] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  // ========================================
  // LOAD PRODUCTS
  // ========================================

  const load = async () => {
    setLoading(true);

    try {
      const data =
        await api(
          `/api/listings?q=${encodeURIComponent(
            q
          )}`
        );

      setItems(
        data.listings || []
      );

      setError('');

    } catch (e) {
      setError(
        e.message
      );

    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // LOAD MY LIKES — ONCE
  // ========================================

  const loadMyLikes =
    async () => {
      if (!auth?.token) {
        setLikedIds([]);
        return;
      }

      try {
        const data =
          await api(
            '/api/my-likes'
          );

        setLikedIds(
          data.likes || []
        );

      } catch (e) {
        setLikedIds([]);
      }
    };

  // ========================================
  // INITIAL LOAD
  // ========================================

  useEffect(() => {
    load();
  }, []);

  // ========================================
  // LOAD LIKES WHEN USER LOGS IN/OUT
  // ========================================

  useEffect(() => {
    loadMyLikes();
  }, [
    auth?.token
  ]);

  // ========================================
  // WEBSOCKET
  // ========================================

  useEffect(() => {
    const ws =
      new WebSocket(WS);

    ws.onmessage = e => {
      try {
        const d =
          JSON.parse(
            e.data
          );

        if (
          d.type ===
          'LISTING_CREATED'
        ) {
          setItems(old => [
            d.listing,
            ...old
          ]);
        }

        if (
          d.type ===
          'LISTING_STATUS'
        ) {
          setItems(old =>
            old.map(x =>
              x.id ===
              d.listingId
                ? {
                    ...x,
                    status:
                      d.status
                  }
                : x
            )
          );
        }

        if (
          d.type ===
          'LISTING_UPDATED'
        ) {
          setItems(old =>
            old.map(x =>
              x.id ===
              d.listing?.id
                ? {
                    ...x,
                    ...d.listing
                  }
                : x
            )
          );
        }

      } catch (e) {
        console.error(
          'WebSocket message error:',
          e
        );
      }
    };

    return () =>
      ws.close();

  }, []);

  return (
    <section>

      <div className="hero">

        <div>
          <p className="eyebrow">
            UNILIA STUDENT
            MARKETPLACE
          </p>

          <h1>
            Buy. Sell. Connect.
          </h1>

          <p>
            Students can discover
            goods, contact owners
            in real time, and book
            items — without online
            payment.
          </p>
        </div>

        <Link
          className="primary"
          to="/post"
        >
          + Post a good
        </Link>

      </div>

      <div className="searchbar">

        <input
          value={q}
          onChange={e =>
            setQ(
              e.target.value
            )
          }
          onKeyDown={e => {
            if (
              e.key ===
              'Enter'
            ) {
              load();
            }
          }}
          placeholder="Search phones, clothes, books, laptops..."
        />

        <button
          onClick={load}
        >
          Search
        </button>

      </div>

      <Notice
        error={error}
      />

      {loading ? (

        <p className="muted">
          Loading marketplace...
        </p>

      ) : (

        <div className="grid">

          {items.map(item => (

            <ProductCard
              key={item.id}
              item={item}
              likedIds={
                likedIds
              }
            />

          ))}

          {!items.length && (

            <div className="empty">
              No goods found.
              Try another search.
            </div>

          )}

        </div>

      )}

    </section>
  );
}
// ========================================
// PRODUCT CARD
// ========================================

function ProductCard({
  item,
  likedIds = []
}) {
  const {
    auth
  } = useAuth();

  const [liked, setLiked] =
    useState(false);

  const [likeCount, setLikeCount] =
    useState(
      Number(
        item.like_count || 0
      )
    );

  const [liking, setLiking] =
    useState(false);

  // Check whether this user already liked this product
  useEffect(() => {
  setLiked(
    likedIds.includes(
      Number(item.id)
    )
  );
}, [
  likedIds,
  item.id
]);

  const handleLike = async () => {
    if (!auth?.token) {
      alert(
        'Please log in to like this product.'
      );

      return;
    }

    if (liking) {
      return;
    }

    setLiking(true);

    try {
      const data =
        await api(
          `/api/listings/${item.id}/like`,
          {
            method: 'POST'
          }
        );

      setLiked(
        data.liked
      );

      setLikeCount(
        Number(
          data.like_count
        )
      );

    } catch (e) {
      alert(
        e.message
      );
    } finally {
      setLiking(false);
    }
  };

  return (
    <article className="card">

      <div className="image-wrap">
        <img
          src={getImageUrl(
            item.image_url
          )}
          alt={item.name}
        />

        <span
          className={`badge ${item.status}`}
        >
          {item.status}
        </span>
      </div>

      <div className="card-content">

        <h3>
          {item.name}
        </h3>

        <p className="price">
          MK{' '}
          {Number(
            item.price
          ).toLocaleString()}
        </p>

        <p>
          {item.location}
        </p>

        <div className="card-actions">

          <button
            className={`like-button ${
              liked ? 'liked' : ''
            }`}
            onClick={handleLike}
            disabled={liking}
          >
            {liked
              ? '❤️'
              : '♡'}
            {' '}
            {likeCount}
          </button>

          <Link
            className="secondary"
            to={`/product/${item.id}`}
          >
            View
          </Link>

        </div>

      </div>

    </article>
  );
}
// AUTH FORM
// ========================================

function AuthForm({
  register = false
}) {
  const {
    login
  } = useAuth();

  const nav =
    useNavigate();

  const [form, setForm] =
    useState({
      name: '',
      email: '',
      password: '',
      location: ''
    });

  const [error, setError] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const submit =
    async e => {
      e.preventDefault();

      setBusy(true);
      setError('');

      try {
        const data =
          await api(
            register
              ? '/api/auth/register'
              : '/api/auth/login',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify(form)
            }
          );

        login(data);

        nav('/');
      } catch (err) {
        setError(
          err.message
        );
      } finally {
        setBusy(false);
      }
    };

  return (
    <div className="auth-page">
      <form
        className="auth-card"
        onSubmit={submit}
      >
        <Logo />

        <h1>
          {register
            ? 'Create your account'
            : 'Welcome back'}
        </h1>

        <p className="muted">
          UNILIA students
          marketplace account
        </p>

        <Notice
          error={error}
        />

        {register && (
          <>
            <label>
              Full name

              <input
                required
                value={form.name}
                onChange={e =>
                  setForm({
                    ...form,
                    name:
                      e.target.value
                  })
                }
              />
            </label>

            <label>
              Location

              <input
                required
                placeholder="e.g. Lilongwe"
                value={
                  form.location
                }
                onChange={e =>
                  setForm({
                    ...form,
                    location:
                      e.target.value
                  })
                }
              />
            </label>
          </>
        )}

        <label>
          Email

          <input
            type="email"
            required
            value={form.email}
            onChange={e =>
              setForm({
                ...form,
                email:
                  e.target.value
              })
            }
          />
        </label>

        <label>
          Password

          <input
            type="password"
            required
            value={
              form.password
            }
            onChange={e =>
              setForm({
                ...form,
                password:
                  e.target.value
              })
            }
          />
        </label>

        <button
          className="primary full"
          disabled={busy}
        >
          {busy
            ? 'Please wait...'
            : register
            ? 'Create account'
            : 'Login'}
        </button>

        <p className="center">
          {register
            ? 'Already have an account? '
            : 'New to UNILIA E-Commerce? '}

          <Link
            to={
              register
                ? '/login'
                : '/register'
            }
          >
            {register
              ? 'Login'
              : 'Register'}
          </Link>
        </p>
      </form>
    </div>
  );
}

// ========================================
// POST PRODUCT
// ========================================

function Post() {
  const [form, setForm] =
    useState({
      name: '',
      price: '',
      description: '',
      location: '',
      order_cost: ''
    });

  const [image, setImage] =
    useState(null);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const nav =
    useNavigate();

  const submit =
    async e => {
      e.preventDefault();

      setError('');
      setSuccess('');

      if (!image) {
        return setError(
          'Please select a product image.'
        );
      }

      const fd =
        new FormData();

      Object.entries(
        form
      ).forEach(
        ([key, value]) =>
          fd.append(
            key,
            value
          )
      );

      fd.append(
        'image',
        image
      );

      setBusy(true);

      try {
        await api(
          '/api/listings',
          {
            method: 'POST',
            body: fd
          }
        );

        setSuccess(
          'Your good is now live on the marketplace.'
        );

        setTimeout(
          () => nav('/'),
          700
        );

      } catch (err) {
        setError(
          err.message
        );
      } finally {
        setBusy(false);
      }
    };

  return (
    <section className="form-page">
      <div className="page-title">
        <p className="eyebrow">
          SELL ON UNILIA
        </p>

        <h1>
          Post your good
        </h1>

        <p>
          Give buyers enough
          information to contact
          you confidently.
        </p>
      </div>

      <form
        className="listing-form"
        onSubmit={submit}
      >
        <Notice
          error={error}
          success={success}
        />

        <label>
          Product image

          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={e =>
              setImage(
                e.target.files?.[0] ||
                null
              )
            }
            required
          />

          {image && (
            <img
              className="preview"
              src={URL.createObjectURL(
                image
              )}
              alt="Preview"
            />
          )}
        </label>

        <div className="two">
          <label>
            Good name

            <input
              required
              placeholder="e.g. HP Laptop"
              value={form.name}
              onChange={e =>
                setForm({
                  ...form,
                  name:
                    e.target.value
                })
              }
            />
          </label>

          <label>
            Cost (MK)

            <input
              required
              type="number"
              min="1"
              value={form.price}
              onChange={e =>
                setForm({
                  ...form,
                  price:
                    e.target.value
                })
              }
            />
          </label>
        </div>

        <div className="two">
          <label>
            Location

            <input
              required
              placeholder="Campus / district"
              value={
                form.location
              }
              onChange={e =>
                setForm({
                  ...form,
                  location:
                    e.target.value
                })
              }
            />
          </label>

          <label>
            Order cost (optional)

            <input
              type="number"
              min="0"
              value={
                form.order_cost
              }
              onChange={e =>
                setForm({
                  ...form,
                  order_cost:
                    e.target.value
                })
              }
            />
          </label>
        </div>

        <label>
          Description

          <textarea
            required
            rows="6"
            placeholder="Condition, size, features, etc."
            value={
              form.description
            }
            onChange={e =>
              setForm({
                ...form,
                description:
                  e.target.value
              })
            }
          />
        </label>

        <button
          className="primary"
          disabled={busy}
        >
          {busy
            ? 'Posting...'
            : 'Publish good'}
        </button>
      </form>
    </section>
  );
}

// ========================================
// PRODUCT DETAILS
// ========================================

function Product() {
  const { id } = useParams();
  const { auth } = useAuth();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [ratings, setRatings] = useState(null);

  const [loading, setLoading] = useState(true);
  const [ratingLoading, setRatingLoading] = useState(true);

  const [message, setMessage] = useState('');

  // ===============================
  // LOAD PRODUCT
  // ===============================

  useEffect(() => {
    const loadProduct = async () => {
      try {
        setLoading(true);

        const data =
          await api(`/api/listings/${id}`);

        setProduct(data.listing || data);

      } catch (e) {
        setMessage(
          e.message ||
          'Could not load product.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [id]);

  // ===============================
  // LOAD SELLER RATINGS
  // ===============================

  useEffect(() => {
    if (!product?.seller_id) {
      return;
    }

    const loadRatings = async () => {
      try {
        setRatingLoading(true);

        const data =
          await api(
            `/api/sellers/${product.seller_id}/ratings`
          );

        setRatings(data);

      } catch (e) {
        console.log(
          'Could not load ratings:',
          e.message
        );
      } finally {
        setRatingLoading(false);
      }
    };

    loadRatings();
  }, [product]);

  // ===============================
  // BOOK PRODUCT
  // ===============================

  const bookProduct = async () => {
    if (!auth) {
      navigate('/login');
      return;
    }

    try {
      setMessage('');

      await api(
        `/api/listings/${id}/book`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            quantity: 1
          })
        }
      );

      setMessage(
        'Product booked successfully!'
      );

    } catch (e) {
      setMessage(
        e.message ||
        'Could not book this product.'
      );
    }
  };

  if (loading) {
    return (
      <main className="page">
        <div className="loading">
          Loading product...
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="page">
        <Notice type="error">
          Product not found.
        </Notice>
      </main>
    );
  }

  const averageRating =
    Number(
      ratings?.summary?.average_rating || 0
    );

  const totalRatings =
    Number(
      ratings?.summary?.total_ratings || 0
    );

  return (
    <main className="page">

      {/* ===============================
          PRODUCT
          =============================== */}

      <div className="product-detail">

        <div className="product-detail-image">
          {product.image_url ? (
            <img
              src={
                `${API}${product.image_url}`
              }
              alt={product.name}
            />
          ) : (
            <div className="image-placeholder">
              No image
            </div>
          )}
        </div>

        <div className="product-detail-info">

          <span
            className={
              `status ${product.status}`
            }
          >
            {product.status}
          </span>

          <h1>
            {product.name}
          </h1>

          <div className="product-price">
            MK {Number(
              product.price
            ).toLocaleString()}
          </div>

          <p className="product-description">
            {product.description ||
              'No description provided.'}
          </p>

          {/* SELLER */}

          <div className="seller-box">

            <div>
              <span className="seller-label">
                Seller
              </span>

              <strong>
                {product.seller_name ||
                  'Unknown seller'}
              </strong>
            </div>

            {/* SELLER RATING */}

            <div className="seller-rating-summary">

              {ratingLoading ? (
                <span>
                  Loading rating...
                </span>
              ) : (
                <>
                  <span className="rating-stars-small">
                    {averageRating > 0
                      ? '★'.repeat(
                          Math.round(
                            averageRating
                          )
                        )
                      : '☆☆☆☆☆'}
                  </span>

                  <strong>
                    {averageRating
                      ? averageRating.toFixed(1)
                      : 'No ratings'}
                  </strong>

                  <span>
                    ({totalRatings}{' '}
                    {totalRatings === 1
                      ? 'review'
                      : 'reviews'})
                  </span>
                </>
              )}

            </div>

          </div>

          {message && (
            <Notice
              type={
                message
                  .toLowerCase()
                  .includes('success')
                  ? 'success'
                  : 'error'
              }
            >
              {message}
            </Notice>
          )}

          {/* ACTIONS */}

          <div className="product-actions">

            {product.status === 'available' ? (
              <button
                className="primary"
                onClick={bookProduct}
              >
                Book This Product
              </button>
            ) : (
              <button
                className="primary"
                disabled
              >
                {product.status === 'sold'
                  ? 'Sold'
                  : 'Not Available'}
              </button>
            )}

            <button
              className="secondary"
              onClick={() =>
                navigate(
                  `/chat/${product.seller_id}`
                )
              }
            >
              💬 Chat with Seller
            </button>

          </div>

        </div>
      </div>

      {/* ===============================
          REVIEWS
          =============================== */}

      <section className="reviews-section">

        <div className="reviews-header">

          <div>
            <h2>
              Seller Reviews
            </h2>

            <p>
              See what other buyers say
              about this seller.
            </p>
          </div>

          <div className="reviews-score">

            <strong>
              {averageRating
                ? averageRating.toFixed(1)
                : '—'}
            </strong>

            <span>
              ★
            </span>

            <small>
              {totalRatings}{' '}
              {totalRatings === 1
                ? 'review'
                : 'reviews'}
            </small>

          </div>

        </div>

        {ratingLoading ? (
          <div className="loading">
            Loading reviews...
          </div>
        ) : !ratings?.ratings?.length ? (
          <div className="empty-state">
            <h3>
              No reviews yet
            </h3>

            <p>
              Be the first buyer to
              review this seller.
            </p>
          </div>
        ) : (
          <div className="reviews-list">

            {ratings.ratings.map(
              (review) => (
                <div
                  className="review-card"
                  key={review.id}
                >

                  <div className="review-top">

                    <div>
                      <strong>
                        {review.buyer_name ||
                          'Buyer'}
                      </strong>

                      <div className="review-stars">
                        {'★'.repeat(
                          Number(
                            review.rating
                          )
                        )}

                        <span>
                          {'☆'.repeat(
                            5 -
                              Number(
                                review.rating
                              )
                          )}
                        </span>
                      </div>
                    </div>

                    <small>
                      {review.created_at
                        ? new Date(
                            review.created_at
                          ).toLocaleDateString()
                        : ''}
                    </small>

                  </div>

                  {review.comment && (
                    <p className="review-comment">
                      "{review.comment}"
                    </p>
                  )}

                </div>
              )
            )}

          </div>
        )}

      </section>

    </main>
  );
}
// ========================================
// BOOKINGS
// ========================================

function Bookings() {
  const { auth } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [ratingBooking, setRatingBooking] =
    useState(null);

  const [rating, setRating] =
    useState(0);

  const [comment, setComment] =
    useState('');

  const [submitting, setSubmitting] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const loadBookings = async () => {
    try {
      setLoading(true);
      setError('');

      const data =
        await api('/api/bookings');

      setBookings(
        data.bookings || []
      );

    } catch (e) {
      setError(
        e.message ||
        'Could not load bookings.'
      );

    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  // ===============================
  // OPEN RATING FORM
  // ===============================

  const openRating = (booking) => {
    setRatingBooking(booking);
    setRating(0);
    setComment('');
    setMessage('');
  };

  // ===============================
  // SUBMIT RATING
  // ===============================

  const submitRating = async () => {
    if (!ratingBooking) {
      return;
    }

    if (rating === 0) {
      setMessage(
        'Please select a rating.'
      );
      return;
    }

    try {
      setSubmitting(true);
      setMessage('');

      const data =
        await api('/api/ratings', {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            booking_id:
              ratingBooking.id,

            rating,

            comment
          })
        });

      setMessage(
        data.message ||
        'Rating submitted successfully.'
      );

      setTimeout(() => {
        setRatingBooking(null);
      }, 1000);

    } catch (e) {
      setMessage(
        e.message ||
        'Could not submit rating.'
      );

    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="page">
        <div className="loading">
          Loading your bookings...
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-title">
        <div>
          <h1>My Bookings</h1>

          <p>
            Goods you have booked from sellers.
          </p>
        </div>
      </div>

      {error && (
        <Notice type="error">
          {error}
        </Notice>
      )}

      {!bookings.length ? (
        <div className="empty-state">
          <h2>No bookings yet</h2>

          <p>
            When you book a good,
            it will appear here.
          </p>

          <Link
            to="/"
            className="primary"
          >
            Browse Marketplace
          </Link>
        </div>
      ) : (
        <div className="bookings-list">
          {bookings.map((booking) => (
            <div
              className="booking-card"
              key={booking.id}
            >
              {/* IMAGE */}

              <div className="booking-image">
                {booking.image_url ? (
                  <img
                    src={
                      `${API}${booking.image_url}`
                    }
                    alt={
                      booking.listing_name
                    }
                  />
                ) : (
                  <div className="image-placeholder">
                    No image
                  </div>
                )}
              </div>

              {/* INFORMATION */}

              <div className="booking-info">
                <h3>
                  {booking.listing_name}
                </h3>

                <p className="booking-price">
                  MK {Number(
                    booking.price
                  ).toLocaleString()}
                </p>

                <p>
                  Seller:{' '}
                  <strong>
                    {booking.seller_name}
                  </strong>
                </p>

                <p>
                  Quantity:{' '}
                  {booking.quantity}
                </p>

                <span
                  className={
                    `status ${booking.listing_status}`
                  }
                >
                  {booking.listing_status}
                </span>

                {/* RATE SELLER */}

                <button
                  className="primary"
                  onClick={() =>
                    openRating(booking)
                  }
                >
                  ⭐ Rate Seller
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===============================
          RATING MODAL
      =============================== */}

      {ratingBooking && (
        <div className="modal-overlay">
          <div className="rating-modal">

            <button
              className="modal-close"
              onClick={() =>
                setRatingBooking(null)
              }
            >
              ×
            </button>

            <h2>
              Rate {ratingBooking.seller_name}
            </h2>

            <p>
              How was your experience
              with this seller?
            </p>

            {/* STARS */}

            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map(
                (star) => (
                  <button
                    key={star}
                    type="button"
                    className={
                      star <= rating
                        ? 'star active'
                        : 'star'
                    }
                    onClick={() =>
                      setRating(star)
                    }
                  >
                    ★
                  </button>
                )
              )}
            </div>

            <div className="rating-number">
              {rating === 0
                ? 'Select a rating'
                : `${rating} out of 5`}
            </div>

            {/* COMMENT */}

            <textarea
              className="rating-comment"
              placeholder="Write a review (optional)..."
              value={comment}
              onChange={(e) =>
                setComment(
                  e.target.value
                )
              }
              maxLength={1000}
              rows={5}
            />

            {message && (
              <Notice
                type={
                  message
                    .toLowerCase()
                    .includes('success')
                    ? 'success'
                    : 'error'
                }
              >
                {message}
              </Notice>
            )}

            <button
              className="primary rating-submit"
              onClick={submitRating}
              disabled={
                submitting ||
                rating === 0
              }
            >
              {submitting
                ? 'Submitting...'
                : 'Submit Rating'}
            </button>

          </div>
        </div>
      )}
    </main>
  );
}
// ========================================
// SELLER DASHBOARD
// ========================================



function Dashboard() {

  const {
    auth
  } = useAuth();

  const nav =
    useNavigate();

  const [listings, setListings] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [editing, setEditing] =
    useState(null);

  const [editForm, setEditForm] =
    useState({
      name: '',
      price: '',
      description: '',
      location: '',
      order_cost: ''
    });

  const [editImage, setEditImage] =
    useState(null);

  const [saving, setSaving] =
    useState(false);

  const [editError, setEditError] =
    useState('');

  // DELETE PRODUCT MODAL
  const [deleting, setDeleting] =
    useState(null);

  const [deleteLoading, setDeleteLoading] =
    useState(false);

  const [deleteError, setDeleteError] =
    useState('');

  const loadListings = () => {

    if (!auth?.token) {
      return;
    }
    setLoading(true);

    api('/api/my-listings')
      .then(data => {
        setListings(
          data.listings || []
        );

        setError('');
      })
      .catch(e => {
        setError(
          e.message
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadListings();
  }, [auth?.token]);

  const startEditing = item => {
    setEditing(item);

    setEditForm({
      name: item.name || '',
      price: item.price || '',
      description:
        item.description || '',
      location:
        item.location || '',
      order_cost:
        item.order_cost ?? ''
    });

    setEditImage(null);
    setEditError('');
  };

  const cancelEditing = () => {
    setEditing(null);

    setEditForm({
      name: '',
      price: '',
      description: '',
      location: '',
      order_cost: ''
    });

    setEditImage(null);
    setEditError('');
  };

  const saveEdit = async e => {
    e.preventDefault();

    if (!editing) {
      return;
    }

    setSaving(true);
    setEditError('');

    try {
      const formData =
        new FormData();

      formData.append(
        'name',
        editForm.name
      );

      formData.append(
        'price',
        editForm.price
      );

      formData.append(
        'description',
        editForm.description
      );

      formData.append(
        'location',
        editForm.location
      );

      formData.append(
        'order_cost',
        editForm.order_cost
      );

      if (editImage) {
        formData.append(
          'image',
          editImage
        );
      }

      const data =
        await api(
          `/api/listings/${editing.id}`,
          {
            method: 'PATCH',
            body: formData
          }
        );

      setListings(
        previous =>
          previous.map(item =>
            item.id === editing.id
              ? data.listing
              : item
          )
      );

      cancelEditing();

    } catch (e) {
      setEditError(
        e.message
      );
    } finally {
      setSaving(false);
    }
  };
  
const deleteListing = item => {
  setDeleting(item);
  setDeleteError('');
};

const confirmDeleteListing = async () => {
  if (!deleting) {
    return;
  }

  setDeleteLoading(true);
  setDeleteError('');

  try {
    await api(
      `/api/listings/${deleting.id}`,
      {
        method: 'DELETE'
      }
    );

    setListings(
      previous =>
        previous.filter(
          product =>
            product.id !== deleting.id
        )
    );

    setDeleting(null);

  } catch (e) {
    setDeleteError(
      e.message
    );

  } finally {
    setDeleteLoading(false);
  }
};

  return (
    <section>
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">
            SELLER CENTER
          </p>

          <h1>
            Seller Dashboard
          </h1>

          <p>
            Manage the products
            you have posted.
          </p>
        </div>

        <button
          className="primary"
          onClick={() =>
            nav('/post')
          }
        >
          + Add Product
        </button>
      </div>

      <Notice
        error={error}
      />

      {editing && (
        <div className="edit-product-panel">
          <h2>
            Edit Product
          </h2>

          <Notice
            error={editError}
          />

          <form
            onSubmit={saveEdit}
          >
            <div className="form-grid">
              <label>
                Product Name

                <input
                  type="text"
                  value={
                    editForm.name
                  }
                  onChange={e =>
                    setEditForm({
                      ...editForm,
                      name:
                        e.target.value
                    })
                  }
                  required
                />
              </label>

              <label>
                Price

                <input
                  type="number"
                  value={
                    editForm.price
                  }
                  onChange={e =>
                    setEditForm({
                      ...editForm,
                      price:
                        e.target.value
                    })
                  }
                  min="1"
                  required
                />
              </label>

              <label>
                Location

                <input
                  type="text"
                  value={
                    editForm.location
                  }
                  onChange={e =>
                    setEditForm({
                      ...editForm,
                      location:
                        e.target.value
                    })
                  }
                  required
                />
              </label>

              <label>
                Order Cost

                <input
                  type="number"
                  value={
                    editForm.order_cost
                  }
                  onChange={e =>
                    setEditForm({
                      ...editForm,
                      order_cost:
                        e.target.value
                    })
                  }
                  min="0"
                />
              </label>
            </div>

            <label>
              Description

              <textarea
                rows="5"
                value={
                  editForm.description
                }
                onChange={e =>
                  setEditForm({
                    ...editForm,
                    description:
                      e.target.value
                  })
                }
                required
              />
            </label>

            <label>
              Replace Image
              <input
                type="file"
                accept="image/*"
                onChange={e =>
                  setEditImage(
                    e.target.files?.[0] ||
                    null
                  )
                }
              />
            </label>

            <div className="dashboard-product-actions">
              <button
                type="button"
                className="secondary"
                onClick={
                  cancelEditing
                }
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && (
        <p className="muted">
          Loading your products...
        </p>
      )}

      {!loading &&
        !error &&
        listings.length === 0 && (
          <div className="empty-state">
            <h2>
              No products yet
            </h2>

            <p>
              You haven't posted
              any products yet.
            </p>

            <button
              className="primary"
              onClick={() =>
                nav('/post')
              }
            >
              Post Your First Product
            </button>
          </div>
        )}

      {!loading &&
        listings.length > 0 && (
          <div className="dashboard-products">
            {listings.map(item => (
              <div
                className="dashboard-product"
                key={item.id}
              >
                <div className="dashboard-product-image">
                  {item.image_url ? (
                    <img
                      src={getImageUrl(item.image_url)}
                      alt={item.name}
                    />
                  ) : (
                    <div className="no-image">
                      No image
                    </div>
                  )}
                </div>

                <div className="dashboard-product-info">
                  <h3>
                    {item.name}
                  </h3>

                  <p className="price">
                    MK{' '}
                    {Number(
                      item.price
                    ).toLocaleString()}
                  </p>

                  <p>
                    Location:{' '}
                    {item.location ||
                      'Not specified'}
                  </p>

                  <p className="product-likes">
                    ❤️{' '}
                    {Number(
                      item.like_count || 0
                    )}{' '}
                    {Number(
                      item.like_count || 0
                    ) === 1
                      ? 'Like'
                      : 'Likes'}
                  </p>

                  <p>
                    Posted:{' '}
                    {item.created_at
                      ? new Date(
                          item.created_at
                        ).toLocaleDateString()
                      : 'Unknown'}
                  </p>

                  <span
                    className={`status status-${item.status}`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="dashboard-product-actions">

  <button
    className="secondary"
    onClick={() =>
      nav(
        `/product/${item.id}`
      )
    }
  >
    View
  </button>

  <button
    className="secondary"
    onClick={() =>
      startEditing(item)
    }
  >
    Edit
  </button>

  <button
    className="delete-button"
    onClick={() =>
      deleteListing(item)
    }
  >
    Delete
  </button>

</div>
              </div>
            ))}
          </div>
        )}

        {deleting && (
  <div
    className="delete-modal-overlay"
    onClick={() => {
      if (!deleteLoading) {
        setDeleting(null);
        setDeleteError('');
      }
    }}
  >
    <div
      className="delete-modal"
      onClick={e =>
        e.stopPropagation()
      }
    >
      <div className="delete-modal-icon">
        🗑️
      </div>

      <h2>
        Delete Product?
      </h2>

      <p className="delete-modal-product">
        {deleting.name}
      </p>

      <p className="delete-modal-message">
        This product will be removed
        from your marketplace.
        This action cannot be undone.
      </p>

      {deleteError && (
        <div className="delete-modal-error">
          {deleteError}
        </div>
      )}

      <div className="delete-modal-actions">

        <button
          type="button"
          className="secondary"
          onClick={() => {
            setDeleting(null);
            setDeleteError('');
          }}
          disabled={deleteLoading}
        >
          Cancel
        </button>

        <button
          type="button"
          className="delete-confirm-button"
          onClick={
            confirmDeleteListing
          }
          disabled={deleteLoading}
        >
          {deleteLoading
            ? 'Deleting...'
            : 'Delete Product'}
        </button>

      </div>
    </div>
  </div>
)}
    </section>
  );
}

// ========================================
// CHAT
// ========================================

function Chat() {
  const {
    auth
  } = useAuth();

  const {
    userId
  } = useParams();

  const [messages, setMessages] =
    useState([]);

  const [body, setBody] =
    useState('');

  const [receiverId, setReceiverId] =
    useState(
      userId || ''
    );

  const [error, setError] =
    useState('');

  const [online, setOnline] =
    useState(false);

  const [ws, setWs] =
    useState(null);

  useEffect(() => {
    if (userId) {
      setReceiverId(
        userId
      );
    }
  }, [userId]);

  useEffect(() => {
    const socket =
      new WebSocket(
        `${WS}?token=${auth.token}`
      );

    setWs(socket);

    socket.onopen =
      () => {
        setOnline(true);
      };

    socket.onclose =
      () => {
        setOnline(false);
      };

    socket.onmessage =
      e => {
        const d =
          JSON.parse(
            e.data
          );

        if (
          d.type ===
          'CHAT_MESSAGE'
        ) {
          setMessages(
            m => [
              ...m,
              d.message
            ]
          );
        }

        if (
          d.type ===
          'ERROR'
        ) {
          setError(
            d.message
          );
        }
      };

    return () =>
      socket.close();

  }, [auth.token]);

  const load =
    async () => {
      if (!receiverId) {
        return;
      }

      try {
        const data =
          await api(
            `/api/messages/${receiverId}`
          );

        setMessages(
          data.messages
        );

        setError('');

      } catch (e) {
        setError(
          e.message
        );
      }
    };

  useEffect(() => {
    if (userId) {
      load();
    }
  }, [userId]);

  const send =
    () => {
      if (
        !ws ||
        !receiverId ||
        !body.trim()
      ) {
        return setError(
          'Enter a receiver ID and message.'
        );
      }

      ws.send(
        JSON.stringify({
          type:
            'CHAT_MESSAGE',

          receiverId:
            Number(
              receiverId
            ),

          body:
            body.trim()
        })
      );

      setBody('');
    };

  return (
    <section className="chat-page">
      <div className="page-title">
        <p className="eyebrow">
          REAL-TIME
        </p>

        <h1>
          Chat
        </h1>

        <p>
          <span
            className={
              online
                ? 'dot online'
                : 'dot'
            }
          ></span>

          {online
            ? ' Connected live'
            : ' Disconnected'}
        </p>
      </div>

      <div className="chat-box">
        <div className="chat-tools">
          <input
            placeholder="Owner / student user ID"
            value={
              receiverId
            }
            onChange={e =>
              setReceiverId(
                e.target.value
              )
            }
          />

          <button
            className="secondary"
            onClick={load}
          >
            Load chat
          </button>
        </div>

        <Notice
          error={error}
        />

        <div className="messages">
          {messages.map(m => (
            <div
              className={
                m.sender_id ===
                auth.user.id
                  ? 'bubble mine'
                  : 'bubble'
              }
              key={m.id}
            >
              <small>
                {m.sender_name}
              </small>

              <div>
                {m.body}
              </div>
            </div>
          ))}
        </div>

        <div className="composer">
          <input
            value={body}
            onChange={e =>
              setBody(
                e.target.value
              )
            }
            onKeyDown={e => {
              if (
                e.key ===
                'Enter'
              ) {
                send();
              }
            }}
            placeholder="Write a message..."
          />

          <button
            className="primary"
            onClick={send}
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}

// ========================================
// APP ROUTES
// ========================================

function App() {
  return (
    <Layout>
      <Routes>

        <Route
          path="/"
          element={
            <Marketplace />
          }
        />

        <Route
          path="/login"
          element={
            <AuthForm />
          }
        />

        <Route
          path="/register"
          element={
            <AuthForm
              register
            />
          }
        />

        <Route
          path="/product/:id"
          element={
            <Product />
          }
        />

        {/* SELLER DASHBOARD */}
        <Route
          path="/dashboard"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />

        <Route
          path="/post"
          element={
            <Protected>
              <Post />
            </Protected>
          }
        />

        <Route
          path="/bookings"
          element={
            <Protected>
              <Bookings />
            </Protected>
          }
        />

        <Route
          path="/chat"
          element={
            <Protected>
              <Chat />
            </Protected>
          }
        />

        <Route
          path="/chat/:userId"
          element={
            <Protected>
              <Chat />
            </Protected>
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to="/"
            />
          }
        />

      </Routes>
    </Layout>
  );
}

// ========================================
// START REACT
// ========================================

createRoot(
  document.getElementById(
    'root'
  )
).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
