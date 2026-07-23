import "./Products.css";

const products = [
  {
    id: 1,
    name: "Premium Cotton Bedsheet",
    price: "₹999",
    oldPrice: "₹1499",
    image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=600",
  },
  {
    id: 2,
    name: "Luxury Towel Set",
    price: "₹699",
    oldPrice: "₹999",
    image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=600",
  },
  {
    id: 3,
    name: "Designer Curtains",
    price: "₹1499",
    oldPrice: "₹1999",
    image: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600",
  },
  {
    id: 4,
    name: "Soft Pillow",
    price: "₹499",
    oldPrice: "₹699",
    image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=600",
  },
];

function Products() {
  return (
    <section className="products">
      <div className="container">
        <h2>Featured Products</h2>

        <div className="product-grid">
          {products.map((item) => (
            <div className="product-card" key={item.id}>
              <img src={item.image} alt={item.name} />

              <h4>{item.name}</h4>

              <div className="price">
                <span className="new">{item.price}</span>
                <span className="old">{item.oldPrice}</span>
              </div>

              <button>Add to Cart</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Products;
