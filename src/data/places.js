// Where customers order from. Tamil Nadu: all 38 districts (Dindigul first).
// Other states: main cities. Every list also allows "Other" (typed by the customer).
const TN = ['Dindigul', 'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Erode', 'Kallakurichi',
  'Kancheepuram', 'Kanniyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris',
  'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi',
  'Tiruchirappalli', 'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar']

export const PLACES = {
  'Tamil Nadu': TN,
  Kerala: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Kottayam', 'Palakkad', 'Kannur', 'Alappuzha', 'Malappuram', 'Idukki', 'Pathanamthitta', 'Kasaragod', 'Wayanad'],
  Karnataka: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi-Dharwad', 'Belagavi', 'Kalaburagi', 'Davanagere', 'Ballari', 'Shivamogga', 'Tumakuru', 'Udupi', 'Hassan'],
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Tirupati', 'Kurnool', 'Kakinada', 'Rajahmundry', 'Anantapur', 'Kadapa', 'Chittoor', 'Ongole'],
  Telangana: ['Hyderabad', 'Warangal', 'Karimnagar', 'Nizamabad', 'Khammam', 'Secunderabad'],
  Puducherry: ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
  Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Navi Mumbai', 'Aurangabad', 'Kolhapur'],
  Delhi: ['New Delhi', 'Delhi'],
  Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar'],
  'West Bengal': ['Kolkata', 'Howrah', 'Siliguri', 'Durgapur', 'Asansol'],
  'Uttar Pradesh': ['Lucknow', 'Noida', 'Ghaziabad', 'Kanpur', 'Agra', 'Varanasi', 'Prayagraj', 'Meerut'],
  Rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer'],
  'Madhya Pradesh': ['Indore', 'Bhopal', 'Gwalior', 'Jabalpur'],
  Haryana: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal'],
  Punjab: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Mohali', 'Patiala'],
  Chandigarh: ['Chandigarh'],
  Goa: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa'],
  Odisha: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri'],
  Bihar: ['Patna', 'Gaya', 'Muzaffarpur'],
  Jharkhand: ['Ranchi', 'Jamshedpur', 'Dhanbad'],
  Chhattisgarh: ['Raipur', 'Bhilai', 'Bilaspur'],
  Uttarakhand: ['Dehradun', 'Haridwar', 'Haldwani'],
  'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Manali'],
  'Jammu & Kashmir': ['Srinagar', 'Jammu'],
  Assam: ['Guwahati', 'Dibrugarh', 'Silchar'],
  'Other states (India)': [],
  'Outside India': [],
}
export const STATES = Object.keys(PLACES)
export const DEFAULT_STATE = 'Tamil Nadu'
export const placeLabel = (city, state) => [city, state].filter(Boolean).join(', ')
