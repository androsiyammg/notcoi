import React, { useState, useEffect, useRef } from "react";
import bountyimg from "../images/bountyimg.png";
import { useSelector } from "react-redux";
import { Client, Databases } from "appwrite";
import service from "../appwrite/database";
import { useLocation, useNavigate } from "react-router-dom";

const Home = () => {
  const { userInfo } = useSelector((state) => state.user);
  const initialTime = 8 * 60 * 60; // 8 hours in seconds
  // const userId = 1337182007;
  // const userId = 1751474467;
  const userId = userInfo?.id ;
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState([]);
  const [bountyAmount, setBountyAmount] = useState(null);
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isFarming, setIsFarming] = useState(false);
  const [taps, setTaps] = useState(100);
  const [floatingPlusPosition, setFloatingPlusPosition] = useState(null);
  const bountyAmountRef = useRef(bountyAmount); // Create a ref to hold the latest bountyAmount

  // Initialize Appwrite client
  const client = new Client();
  const databases = new Databases(client);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!userId) return;

    client
      .setEndpoint(process.env.REACT_APP_APPWRITE_URL)
      .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

    const channel = `databases.${process.env.REACT_APP_APPWRITE_DATABASE_ID}.collections.${process.env.REACT_APP_APPWRITE_USERS_COLLECTION_ID}.documents.${userId}`;

    // Subscribe to real-time updates on the user's document
    const unsubscribe = client.subscribe(channel, (response) => {
      if (response.payload && response.payload.coins) {
        setBountyAmount(response.payload.coins);
      }
      if (response.payload && response.payload.taps) {
        setTaps(response.payload.taps);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [userId]);

  // Fetch user data for coins and taps from Appwrite
  const fetchUserData = async () => {
    try {
      const userData = await databases.getDocument(
        process.env.REACT_APP_APPWRITE_DATABASE_ID,
        process.env.REACT_APP_APPWRITE_USERS_COLLECTION_ID,
        userId.toString()
      );

      console.log(userData)
      setUser(userData);
      setBountyAmount(userData.coins);
      setTaps(userData.taps);
    } catch (error) {
      console.error("Error fetching user data:", error);
    }finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, []);


  // Update the ref whenever bountyAmount changes
  useEffect(() => {
    bountyAmountRef.current = bountyAmount;
  }, [bountyAmount]);


// Set up a 10-second interval to save coins in the database
useEffect(() => {
  const saveInterval = setInterval(() => {
    if (isFarming) { // Only save if farming is active
      console.log("Saving bountyAmount to the database:", bountyAmountRef.current);
      saveUserData(bountyAmountRef.current);
      localStorage.setItem("lastSaved", Date.now());
    }
  }, 10000); // Every 10 seconds

  // Cleanup the interval on component unmount
  return () => clearInterval(saveInterval);
}, [userId, isFarming]); // Add isFarming to dependencies to listen for changes




// Set up a 10-second interval to save coins in the database only when farming is active
useEffect(() => {
  const saveInterval = setInterval(() => {
    if (isFarming) {
      saveUserData(bountyAmountRef.current);
      localStorage.setItem("lastSaved", Date.now());
    }
  }, 10000);

  return () => clearInterval(saveInterval);
}, [isFarming, userId]);

// Load farming state and add offline earnings on app load
useEffect(() => {
  const lastSavedTime = parseInt(localStorage.getItem("lastSaved") || Date.now(), 10);
  const isFarmingActive = localStorage.getItem("isFarming") === "true";
  const savedBountyAmount = parseFloat(localStorage.getItem("bountyAmount") || "0");
  const savedTimeLeft = parseInt(localStorage.getItem("timeLeft") || "0", 10);

  if (isFarmingActive && lastSavedTime) {
    // Calculate elapsed time since last save
    const currentTime = Date.now();
    const elapsedTime = Math.floor((currentTime - lastSavedTime) / 1000);

    // Calculate coins earned during the time app was closed
    const offlineCoinsEarned = calculatePerSecondEarning(savedBountyAmount) * elapsedTime;
    
    console.log("Elapsed time (seconds):", elapsedTime);
    console.log("Coins earned while app was closed:", offlineCoinsEarned);

    // Add offline coins to bountyAmount
    setBountyAmount(savedBountyAmount + offlineCoinsEarned);
    bountyAmountRef.current = savedBountyAmount + offlineCoinsEarned;

    // Update remaining farming time
    const newTimeLeft = Math.max(savedTimeLeft - elapsedTime, 0);
    setTimeLeft(newTimeLeft);

    // If time left is zero, stop farming
    if (newTimeLeft <= 0) {
      resetFarming();
    } else {
      setIsFarming(true);
    }
  }
}, []);



  const resetFarming = () => {
    setIsFarming(false);
    setTaps(100);
    localStorage.removeItem("endTime");
    service.updateUserData(userId, { taps: 100 });
  };




  const APY = 2.4; // 240% APY represented as a multiplier (2.4 = 240%)
  const SECONDS_IN_A_YEAR = 31536000;

  // Function to calculate per-second earnings
  const calculatePerSecondEarning = (amount) => {
   
    const perSecond = (amount * APY) / SECONDS_IN_A_YEAR;
    return perSecond

  };
  // Countdown timer effect
  useEffect(() => {
    let timer;
    if (isFarming && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prevTime) => prevTime - 1);
   
        let coinIncrease = calculatePerSecondEarning(bountyAmount);
        
       
        setBountyAmount((prevBounty) => prevBounty + coinIncrease);

        if (timeLeft <= 1) {
          resetFarming();
        }
      }, 1000);


    }

    console.log(bountyAmount)

    return () => {

      clearInterval(timer);

    }

  }, [isFarming, timeLeft]);

  // Handle starting the farming timer
  const handleStartFarming = () => {
    if (timeLeft === 0) {
      setTimeLeft(initialTime);
      setTaps(100);
      service.updateUserData(userId, { taps: 100 });
    }
    setIsFarming(true);
    const startTime = Date.now();
    const endTime = Date.now() + initialTime * 1000;
    localStorage.setItem("endTime", endTime);
    localStorage.setItem("startTime", startTime);
    localStorage.setItem("isFarming", true);
    localStorage.setItem("timeLeft", initialTime); // Store the initial time left
  };

  useEffect(() => {
    const savedStartTime = localStorage.getItem("startTime");
    const lastSavedTime = localStorage.getItem("lastSaved");
    const isFarmingActive = localStorage.getItem("isFarming") === "true";
    const initialTimeLeft = parseInt(localStorage.getItem("timeLeft"), 10);

    if (isFarmingActive && savedStartTime) {
      const currentTime = Date.now();
      const elapsedTime = Math.floor((currentTime - parseInt(lastSavedTime, 10)) / 1000); // Calculate elapsed time in seconds

      console.log("Elapsed time in seconds:", elapsedTime);

      // Calculate total coins earned based on elapsed time

      // const totalCoinsEarned = calculatePerSecondEarning(bountyAmount) * elapsedTime;
      // console.log("Coins earned during inactivity:", totalCoinsEarned);
     
// saveUserData(bountyAmountRef.current+ totalCoinsEarned)


      // Update the bounty amount with the earned coins
      // console.log(user)
      // setBountyAmount((prevBounty) => prevBounty + totalCoinsEarned);
      // setBountyAmount(bountyAmount + totalCoinsEarned);

      // Calculate the remaining time
      const remainingTime = Math.max(0, initialTimeLeft - elapsedTime);
      setTimeLeft(remainingTime);

      // Reset farming if the remaining time is zero
      if (remainingTime === 0) {
        resetFarming();
      }
    }
  }, []);






  const saveUserData = (amount) => {
    console.log(amount)
    // Update the user's coins in the database
    service.updateUserData(userId, { coins: amount })
      .then(response => {
        console.log("Data saved successfully:", response);
      })
      .catch(error => {
        console.error("Error saving data:", error);
      });
  };


  // Store progress in localStorage on visibility change and before unload
  useEffect(() => {
    const saveOnVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Save bountyAmount to localStorage and database on tab hidden
        localStorage.setItem("bountyAmount", bountyAmount.toString());
        saveUserData( bountyAmountRef.current);
      }
    };

    const saveOnBeforeUnload = (event) => {
      // Save bountyAmount to localStorage and database on page close
      localStorage.setItem("bountyAmount", bountyAmount.toString());
      saveUserData( bountyAmountRef.current);
      event.returnValue = ''; // Compatibility for older browsers
    };

    // Event listeners for visibility change and before unload
    document.addEventListener("visibilitychange", saveOnVisibilityChange);
    window.addEventListener("beforeunload", saveOnBeforeUnload);

    // Cleanup event listeners on component unmount
    return () => {
      document.removeEventListener("visibilitychange", saveOnVisibilityChange);
      window.removeEventListener("beforeunload", saveOnBeforeUnload);
    };
  }, [userId, bountyAmount]);




  // Handle image tap
  const handleImageTap = async () => {
    if (taps > 0) {
      const newAmount = bountyAmount + 1;
      const newTaps = taps - 1;

      setBountyAmount(newAmount);
      setTaps(newTaps);

      try {
        await service.updateUserData(userId, { coins: newAmount, taps: newTaps });
      } catch (error) {
        console.error("Error updating coins and taps in Appwrite:", error);
      }

      // Floating +1 animation
      const randomX = Math.random() * 50 + 25;
      const randomY = Math.random() * 40 + 10;
      setFloatingPlusPosition({ x: randomX, y: randomY });

      setTimeout(() => {
        setFloatingPlusPosition(null);
      }, 1000);
    }
  };

  // Format time from seconds to hh:mm:ss
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  };



// if (loading) {
//   return <div>loading...</div>;
// }

  return (
    <div className="flex flex-col items-center justify-between h-[65vh] bg-[#1f221f] text-white p-4 overflow-hidden">
      {userInfo.first_name || userInfo.username ? (
        <div className="w-full flex flex-col text-left px-4 gap-4">
          <h2 className="font-bold text-lg md:text-xl">
            Welcome, {userInfo.first_name || userInfo.username}!
          </h2>

          <div className="flex space-x-4 items-center justify-start w-full rounded-lg text-xs">
            <div className="bg-gradient-to-r from-black to-[#7d5126] px-8 py-3 rounded-lg font-bold">
              {formatTime(timeLeft)} Left
            </div>
            <div className="px-3 py-3 rounded-md border border-[#7d5126]">
              {taps} Taps
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative mt-4 w-full flex justify-center" onClick={handleImageTap}>
        <img
          src={bountyimg}
          alt="Bounty Token"
          className="w-2/3 md:w-1/2 h-auto object-contain cursor-pointer"
        />
        {floatingPlusPosition && (
          <div
            className="floating-plus absolute text-lg text-green-500"
            style={{
              left: `${floatingPlusPosition.x}%`,
              top: `${floatingPlusPosition.y}%`,
            }}
          >
            +1
          </div>
        )}
      </div>

      <div className="text-center mt-4">
        {bountyAmount && <h2 className="text-3xl font-bold">{bountyAmount.toFixed(4)} BNTY</h2>}
        <p className="text-gray-400">Bounty Token</p>
      </div>

      <button
        className="bg-gradient-to-r fixed bottom-24 from-black to-[#7d5126] px-8 py-3 rounded-lg w-full text-lg font-bold"
        onClick={handleStartFarming}
        disabled={isFarming && timeLeft > 0}
      >
        {isFarming ? "Farming..." : "Start Farming"}
      </button>
    </div>
  );
};

export default Home;

